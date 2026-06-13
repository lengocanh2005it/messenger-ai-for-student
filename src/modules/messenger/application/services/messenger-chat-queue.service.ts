import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import {
  capMergedChatUserText,
  mergeChatUserTexts,
} from '../../../../shared/utils/messenger-text.utils';
import { ChatRateLimitService } from '../../../chat-rate-limit/application/services/chat-rate-limit.service';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import type { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import { MessengerAgentService } from '../agent/messenger-agent.service';
import type { ChatQuotaCheckResult } from '../../../chat-rate-limit/domain/entities/chat-quota.types';
import {
  buildChatQuotaDenyMessage,
  buildChatQuotaRemainingHintMessage,
  shouldShowQuotaRemainingHint,
} from '../messages/chat-quota.messages';
import { MessengerChatHistoryService } from './messenger-chat-history.service';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';
import {
  MessengerOutboundService,
  MessengerPartialSendError,
} from './messenger-outbound.service';
import { buildChatDeliveryErrorMessage } from '../messages/chat-delivery.messages';

export interface EnqueueChatMessageInput {
  psid: string;
  userId?: number;
  userText: string;
  linkContext?: MessengerLinkContext;
  /** Meta message.mid — idempotency key for the last message in a debounce batch. */
  idempotencyKey?: string;
}

interface PsidChatQueueState {
  texts: string[];
  lastIdempotencyKey?: string;
  userId?: number;
  linkContext?: MessengerLinkContext;
  debounceTimer?: ReturnType<typeof setTimeout>;
  processing: boolean;
  pendingWhileProcessing: string[];
  lastPendingIdempotencyKey?: string;
}

interface ChatBatchInput {
  psid: string;
  mergedText: string;
  userId?: number;
  linkContext?: MessengerLinkContext;
  idempotencyKey?: string;
}

@Injectable()
export class MessengerChatQueueService {
  private readonly logger = new Logger(MessengerChatQueueService.name);
  private readonly queues = new Map<string, PsidChatQueueState>();
  private readonly sharedFlushTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly outbound: MessengerOutboundService,
    private readonly messengerAgentService: MessengerAgentService,
    private readonly chatHistory: MessengerChatHistoryService,
    private readonly chatRateLimitService: ChatRateLimitService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly messengerRepository: MessengerRepositoryPort,
    @Optional()
    private readonly sharedConfig?: MessengerChatSharedConfigService,
    @Optional()
    @Inject(MESSENGER_CHAT_SHARED_STATE_REPOSITORY)
    private readonly sharedState?: MessengerChatSharedStateRepositoryPort,
  ) {}

  enqueue(input: EnqueueChatMessageInput): void {
    const text = input.userText.trim();
    if (!text) {
      return;
    }

    void this.outbound.sendSenderAction(input.psid, 'mark_seen');

    if (this.isSharedMode()) {
      void this.enqueueShared(input, text);
      return;
    }

    let state = this.queues.get(input.psid);
    if (!state) {
      state = {
        texts: [],
        processing: false,
        pendingWhileProcessing: [],
      };
      this.queues.set(input.psid, state);
    }

    state.userId = input.userId ?? state.userId;
    state.linkContext = input.linkContext ?? state.linkContext;

    if (state.processing) {
      state.pendingWhileProcessing.push(text);
      if (input.idempotencyKey) {
        state.lastPendingIdempotencyKey = input.idempotencyKey;
      }
      this.logger.log(
        `Queued chat while processing psid=${input.psid} (pending=${state.pendingWhileProcessing.length})`,
      );
      return;
    }

    state.texts.push(text);
    if (input.idempotencyKey) {
      state.lastIdempotencyKey = input.idempotencyKey;
    }
    this.scheduleFlush(input.psid, state);
  }

  /** H7: worker/cron entry for shared queue flush. */
  async flushReady(psid: string): Promise<void> {
    await this.flush(psid);
  }

  private async enqueueShared(
    input: EnqueueChatMessageInput,
    text: string,
  ): Promise<void> {
    try {
      await this.sharedState!.appendChatBuffer({
        psid: input.psid,
        userText: text,
        userId: input.userId,
        linkContext: input.linkContext,
        idempotencyKey: input.idempotencyKey,
        debounceMs: this.getDebounceMs(),
      });
      this.scheduleSharedFlush(input.psid);
    } catch (error) {
      this.logger.error(
        `Shared chat enqueue failed psid=${input.psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private scheduleFlush(psid: string, state: PsidChatQueueState): void {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
      void this.flush(psid);
    }, this.getDebounceMs());
  }

  private scheduleSharedFlush(psid: string): void {
    const existing = this.sharedFlushTimers.get(psid);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.sharedFlushTimers.delete(psid);
      void this.flush(psid);
    }, this.getDebounceMs());

    this.sharedFlushTimers.set(psid, timer);
  }

  private async flush(psid: string): Promise<void> {
    if (this.isSharedMode()) {
      await this.flushShared(psid);
      return;
    }

    await this.flushMemory(psid);
  }

  private async flushShared(psid: string): Promise<void> {
    const snapshot = await this.sharedState!.claimReadyBuffer(
      psid,
      this.getDebounceMs(),
      this.sharedConfig!.getProcessingStuckMs(),
    );

    if (!snapshot || snapshot.texts.length === 0) {
      return;
    }

    const mergedText = capMergedChatUserText(
      mergeChatUserTexts(snapshot.texts),
      this.getMergedTextMaxChars(),
    );

    try {
      await this.processChatBatch({
        psid,
        mergedText,
        userId: snapshot.userId,
        linkContext: snapshot.linkContext,
        idempotencyKey: snapshot.lastIdempotencyKey,
      });
    } finally {
      const hasPending = await this.sharedState!.completeChatBuffer({
        psid,
        debounceMs: this.getDebounceMs(),
      });

      if (hasPending) {
        this.scheduleSharedFlush(psid);
      }
    }
  }

  private async flushMemory(psid: string): Promise<void> {
    const state = this.queues.get(psid);
    if (!state || state.processing || !state.texts.length) {
      return;
    }

    state.processing = true;
    const mergedText = capMergedChatUserText(
      mergeChatUserTexts(state.texts),
      this.getMergedTextMaxChars(),
    );
    state.texts = [];
    const { userId, linkContext } = state;
    const idempotencyKey = state.lastIdempotencyKey;
    state.lastIdempotencyKey = undefined;

    try {
      await this.processChatBatch({
        psid,
        mergedText,
        userId,
        linkContext,
        idempotencyKey,
      });
    } finally {
      state.processing = false;

      if (state.pendingWhileProcessing.length > 0) {
        state.texts.push(...state.pendingWhileProcessing);
        state.pendingWhileProcessing = [];
        state.lastIdempotencyKey = state.lastPendingIdempotencyKey;
        state.lastPendingIdempotencyKey = undefined;
      }

      if (state.texts.length > 0) {
        this.scheduleFlush(psid, state);
      } else if (
        !state.debounceTimer &&
        state.pendingWhileProcessing.length === 0
      ) {
        this.queues.delete(psid);
      }
    }
  }

  private async processChatBatch(input: ChatBatchInput): Promise<void> {
    const { psid, mergedText, userId, linkContext, idempotencyKey } = input;

    let reservedUsageDate: string | undefined;
    let reservedIdempotencyKey: string | undefined;
    let reservedQuota: ChatQuotaCheckResult | undefined;
    let mainReplyDelivered = false;
    let quotaFinalized = false;

    const finalizeQuota = async (): Promise<void> => {
      if (quotaFinalized || !reservedIdempotencyKey) {
        return;
      }

      await this.chatRateLimitService.markCompleted(reservedIdempotencyKey);
      quotaFinalized = true;
    };

    try {
      await this.outbound.sendSenderAction(psid, 'typing_on');

      if (idempotencyKey) {
        const quota = await this.chatRateLimitService.reserveFreeFormSlot(
          psid,
          {
            userId,
            idempotencyKey,
          },
        );

        if (!quota.allowed) {
          if (quota.reason === 'IDEMPOTENCY_CONFLICT') {
            this.logger.log(
              `Skipping duplicate chat flush mid=${idempotencyKey} psid=${psid}`,
            );
            return;
          }

          const denyReason =
            quota.reason === 'BURST_LIMIT' ? 'BURST_LIMIT' : 'DAILY_LIMIT';

          await this.outbound.sendTextViaPsid({
            psid,
            userId,
            text: buildChatQuotaDenyMessage(denyReason, quota.limit),
            messageType: 'CHAT_QUOTA_DENIED',
          });
          return;
        }

        if (quota.quotaReserved) {
          reservedUsageDate = quota.usageDate;
          reservedIdempotencyKey = idempotencyKey;
          reservedQuota = quota;

          await this.messengerRepository.logMessage({
            userId,
            psid,
            messageType: 'FREE_FORM_CHAT_IN',
            messageText: mergedText,
            status: 'SENT',
          });
        }
      } else if (this.chatRateLimitService.shouldEnforceForPsid(psid)) {
        this.logger.error(
          `Chat flush without message.mid psid=${psid}; skipped (H5)`,
        );
        return;
      } else {
        this.logger.warn(
          `Chat flush without message.mid psid=${psid}; rate limit reserve skipped`,
        );
      }

      const reply = await this.messengerAgentService.reply({
        psid,
        userId,
        userText: mergedText,
        linkContext,
        history: await this.chatHistory.getHistory(psid),
      });

      const assistantText = reply.text.trim();
      if (assistantText) {
        await this.chatHistory.appendTurn(psid, mergedText, assistantText);
        mainReplyDelivered = await this.deliverMainReplyBubbles({
          psid,
          userId,
          text: assistantText,
        });

        if (mainReplyDelivered) {
          await finalizeQuota();
        }
      } else if (reservedIdempotencyKey) {
        await finalizeQuota();
      }

      await this.deliverOptionalChatExtras({
        psid,
        userId,
        richFollowUps: reply.richFollowUps,
        reservedQuota,
      });
    } catch (error) {
      if (!quotaFinalized && !mainReplyDelivered) {
        if (reservedIdempotencyKey && reservedUsageDate) {
          await this.chatRateLimitService.refundFreeFormSlot(
            psid,
            reservedUsageDate,
            reservedIdempotencyKey,
          );
        }

        this.logger.error(
          `Chat queue failed before delivery psid=${psid}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        await this.sendChatDeliveryFallback(psid, userId, error);
      } else {
        this.logger.error(
          `Chat queue failed after partial delivery psid=${psid}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private isSharedMode(): boolean {
    return this.sharedConfig?.isSharedQueueEnabled() === true;
  }

  /** H4: mark quota consumed once the first main reply bubble is sent. */
  private async deliverMainReplyBubbles(params: {
    psid: string;
    userId?: number;
    text: string;
  }): Promise<boolean> {
    try {
      const bubblesSent = await this.outbound.sendTextBubblesViaPsid({
        psid: params.psid,
        userId: params.userId,
        text: params.text,
        messageType: 'FREE_FORM_CHAT_OUT',
        maxBubbles: this.getMaxBubbles(),
        maxCharsPerBubble: this.getMaxCharsPerBubble(),
      });

      return bubblesSent > 0;
    } catch (error) {
      if (
        error instanceof MessengerPartialSendError &&
        error.bubblesSent > 0
      ) {
        this.logger.warn(
          `Partial main reply delivery psid=${params.psid} bubblesSent=${error.bubblesSent}`,
        );
        return true;
      }

      throw error;
    }
  }

  /** H4: follow-up / hint failures must not rollback the main reply or quota. */
  private async deliverOptionalChatExtras(params: {
    psid: string;
    userId?: number;
    richFollowUps: Awaited<
      ReturnType<MessengerAgentService['reply']>
    >['richFollowUps'];
    reservedQuota?: ChatQuotaCheckResult;
  }): Promise<void> {
    if (params.richFollowUps.length > 0) {
      try {
        await this.outbound.sendRichFollowUps({
          psid: params.psid,
          userId: params.userId,
          followUps: params.richFollowUps,
        });
      } catch (error) {
        this.logger.warn(
          `Rich follow-up delivery failed psid=${params.psid}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (params.reservedQuota) {
      try {
        await this.sendQuotaRemainingHintIfNeeded(
          params.psid,
          params.userId,
          params.reservedQuota,
        );
      } catch (error) {
        this.logger.warn(
          `Quota hint delivery failed psid=${params.psid}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private async sendChatDeliveryFallback(
    psid: string,
    userId: number | undefined,
    error: unknown,
  ): Promise<void> {
    try {
      await this.outbound.sendTextViaPsid({
        psid,
        userId,
        text: buildChatDeliveryErrorMessage(error),
        messageType: 'FREE_FORM_CHAT_ERROR',
      });
    } catch (sendError) {
      this.logger.error(
        `Failed to send chat error fallback psid=${psid}: ${
          sendError instanceof Error ? sendError.message : String(sendError)
        }`,
      );
    }
  }

  private async sendQuotaRemainingHintIfNeeded(
    psid: string,
    userId: number | undefined,
    quota: ChatQuotaCheckResult,
  ): Promise<void> {
    const { remainingHintThreshold } = this.chatRateLimitService.getSettings();
    if (
      !shouldShowQuotaRemainingHint(quota.remaining, remainingHintThreshold)
    ) {
      return;
    }

    await this.outbound.sendTextViaPsid({
      psid,
      userId,
      text: buildChatQuotaRemainingHintMessage(quota.remaining),
      messageType: 'CHAT_QUOTA_REMAINING_HINT',
    });
  }

  private getMergedTextMaxChars(): number {
    return this.chatRateLimitService.getSettings().mergedTextMaxChars;
  }

  private getDebounceMs(): number {
    const parsed = Number(
      this.configService.get<string>('CHAT_DEBOUNCE_MS') ?? 2000,
    );
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 2000;
    }

    return Math.min(Math.floor(parsed), 10_000);
  }

  private getMaxBubbles(): number {
    const parsed = Number(
      this.configService.get<string>('CHAT_MAX_BUBBLES') ?? 4,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 4;
    }

    return Math.min(Math.floor(parsed), 10);
  }

  private getMaxCharsPerBubble(): number {
    const parsed = Number(
      this.configService.get<string>('CHAT_BUBBLE_MAX_CHARS') ?? 640,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 640;
    }

    return Math.min(Math.floor(parsed), 2000);
  }
}

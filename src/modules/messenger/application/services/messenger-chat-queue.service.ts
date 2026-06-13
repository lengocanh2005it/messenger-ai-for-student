import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import { mergeChatUserTexts } from '../../../../shared/utils/messenger-text.utils';
import { ChatRateLimitService } from '../../../chat-rate-limit/application/services/chat-rate-limit.service';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import { MessengerAgentService } from '../agent/messenger-agent.service';
import type { ChatQuotaCheckResult } from '../../../chat-rate-limit/domain/entities/chat-quota.types';
import {
  buildChatQuotaDenyMessage,
  buildChatQuotaRemainingHintMessage,
  shouldShowQuotaRemainingHint,
} from '../messages/chat-quota.messages';
import { MessengerChatHistoryService } from './messenger-chat-history.service';
import { MessengerOutboundService } from './messenger-outbound.service';

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

@Injectable()
export class MessengerChatQueueService {
  private readonly logger = new Logger(MessengerChatQueueService.name);
  private readonly queues = new Map<string, PsidChatQueueState>();

  constructor(
    private readonly configService: ConfigService,
    private readonly outbound: MessengerOutboundService,
    private readonly messengerAgentService: MessengerAgentService,
    private readonly chatHistory: MessengerChatHistoryService,
    private readonly chatRateLimitService: ChatRateLimitService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly messengerRepository: MessengerRepositoryPort,
  ) {}

  enqueue(input: EnqueueChatMessageInput): void {
    const text = input.userText.trim();
    if (!text) {
      return;
    }

    void this.outbound.sendSenderAction(input.psid, 'mark_seen');

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

  private scheduleFlush(psid: string, state: PsidChatQueueState): void {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
      void this.flush(psid);
    }, this.getDebounceMs());
  }

  private async flush(psid: string): Promise<void> {
    const state = this.queues.get(psid);
    if (!state || state.processing || !state.texts.length) {
      return;
    }

    state.processing = true;
    const mergedText = mergeChatUserTexts(state.texts);
    state.texts = [];
    const { userId, linkContext } = state;
    const idempotencyKey = state.lastIdempotencyKey;
    state.lastIdempotencyKey = undefined;

    let reservedUsageDate: string | undefined;
    let reservedIdempotencyKey: string | undefined;
    let reservedQuota: ChatQuotaCheckResult | undefined;

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
        history: this.chatHistory.getHistory(psid),
      });

      if (reply.text.trim()) {
        this.chatHistory.appendTurn(psid, mergedText, reply.text);
        await this.outbound.sendTextBubblesViaPsid({
          psid,
          userId,
          text: reply.text,
          messageType: 'FREE_FORM_CHAT_OUT',
          maxBubbles: this.getMaxBubbles(),
          maxCharsPerBubble: this.getMaxCharsPerBubble(),
        });
      }

      if (reply.richFollowUps.length > 0) {
        await this.outbound.sendRichFollowUps({
          psid,
          userId,
          followUps: reply.richFollowUps,
        });
      }

      if (reservedQuota) {
        await this.sendQuotaRemainingHintIfNeeded(psid, userId, reservedQuota);
      }

      if (reservedIdempotencyKey) {
        await this.chatRateLimitService.markCompleted(reservedIdempotencyKey);
      }
    } catch (error) {
      if (reservedIdempotencyKey && reservedUsageDate) {
        await this.chatRateLimitService.refundFreeFormSlot(
          psid,
          reservedUsageDate,
          reservedIdempotencyKey,
        );
      }

      this.logger.error(
        `Chat queue failed for psid=${psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      try {
        await this.outbound.sendTextViaPsid({
          psid,
          userId,
          text: 'Xin lỗi, mình chưa xử lý được tin nhắn. Bạn thử gửi lại sau giây lát nhé.',
          messageType: 'FREE_FORM_CHAT_ERROR',
        });
      } catch (sendError) {
        this.logger.error(
          `Failed to send chat error fallback psid=${psid}: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`,
        );
      }
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

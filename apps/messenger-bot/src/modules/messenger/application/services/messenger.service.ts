import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessengerLinkContext,
  buildWelcomeMessage,
  getMissingUserRefMessage,
} from '../../../../shared/config/poc.constants';
import { UserDisplayNameService } from '../../../study-reminder/application/services/user-display-name.service';
import { getStudyReminderLeadTimeNotice } from '../../../study-reminder/application/messages/study-reminder.messages';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import { WEBHOOK_DEDUPE_STORE } from '../../domain/repositories/webhook-dedupe.store.port';
import type { WebhookDedupeStorePort } from '../../domain/repositories/webhook-dedupe.store.port';
import { MESSENGER_WEBHOOK_DEAD_LETTER_REPOSITORY } from '../../domain/repositories/messenger-webhook-dead-letter.repository.port';
import type { MessengerWebhookDeadLetterRepositoryPort } from '../../domain/repositories/messenger-webhook-dead-letter.repository.port';
import {
  MessengerWebhookEvent,
  MessengerWebhookPayload,
} from '../../domain/entities/messenger.types';
import { ChatRateLimitConfigService } from '../../../chat-rate-limit/application/services/chat-rate-limit-config.service';
import { MessengerChatQueueService } from './messenger-chat-queue.service';
import { buildChatMissingMidMessage } from '../messages/chat-delivery.messages';
import { isUnsupportedUserMessage } from '../utils/webhook-message.utils';
import { buildUnsupportedMessageTypeReply } from '../messages/chat-delivery.messages';
import { MessengerMappingService } from './messenger-mapping.service';
import { MessengerLinkContextService } from './messenger-link-context.service';
import { MessengerOutboundService } from './messenger-outbound.service';
import { MessengerRescheduleConfirmationService } from './messenger-reschedule-confirmation.service';
import { buildMessengerLinkVerifyFailedMessage } from '../messages/messenger-link.messages';
import {
  CANCEL_RESCHEDULE_POSTBACK,
  CONFIRM_RESCHEDULE_POSTBACK,
} from '../constants/messenger-reschedule.constants';
import { buildRescheduleSuccessRichFollowUp } from '../formatters/messenger-rich-message.builder';
import type {
  MessengerLinkAttemptResult,
  MessengerLinkVerifyFailureReason,
} from '../../domain/types/messenger-link-verify.types';
import { MessengerReportDeliveryService } from './messenger-report-delivery.service';
import { MessengerReminderDeliveryService } from './messenger-reminder-delivery.service';

export { MessengerApiError } from './messenger-outbound.service';

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly repository: MessengerRepositoryPort,
    private readonly outbound: MessengerOutboundService,
    private readonly messengerMappingService: MessengerMappingService,
    private readonly messengerLinkContextService: MessengerLinkContextService,
    private readonly messengerChatQueueService: MessengerChatQueueService,
    private readonly reportDeliveryService: MessengerReportDeliveryService,
    private readonly reminderDeliveryService: MessengerReminderDeliveryService,
    private readonly userDisplayNameService: UserDisplayNameService,
    private readonly chatRateLimitConfig: ChatRateLimitConfigService,
    private readonly rescheduleConfirmationService: MessengerRescheduleConfirmationService,
    @Inject(WEBHOOK_DEDUPE_STORE)
    private readonly webhookDedupeStore: WebhookDedupeStorePort,
    @Optional()
    @Inject(MESSENGER_WEBHOOK_DEAD_LETTER_REPOSITORY)
    private readonly deadLetterRepository?: MessengerWebhookDeadLetterRepositoryPort,
  ) {}

  verifyWebhook(token?: string, challenge?: string): string {
    if (token !== this.configService.get<string>('VERIFY_TOKEN')) {
      throw new ForbiddenException('Invalid verify token');
    }

    return challenge ?? '';
  }

  async handleWebhook(payload: MessengerWebhookPayload): Promise<{
    processed: number;
    failures: Array<{ psid?: string; error: string }>;
  }> {
    const failures: Array<{ psid?: string; error: string }> = [];
    let processed = 0;

    for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
      for (const event of Array.isArray(entry.messaging)
        ? entry.messaging
        : []) {
        this.logIncomingWebhookEvent(event);
        try {
          const handled = await this.handleEvent(event);
          processed += handled ? 1 : 0;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          failures.push({ psid: event.sender?.id, error: errorMessage });

          this.logger.warn(
            `Webhook event for PSID ${event.sender?.id ?? 'unknown'} failed — saving to dead-letter: ${errorMessage}`,
          );

          if (this.deadLetterRepository) {
            await this.deadLetterRepository
              .save({
                psid: event.sender?.id ?? null,
                messageMid: event.message?.mid ?? null,
                rawPayload: event,
                errorMessage,
              })
              .catch((saveErr: unknown) => {
                this.logger.error(
                  `Failed to save dead-letter entry: ${
                    saveErr instanceof Error ? saveErr.message : String(saveErr)
                  }`,
                );
              });
          }
        }
      }
    }

    return { processed, failures };
  }

  async replayWebhookEvent(
    rawPayload: object,
  ): Promise<{ handled: boolean; error?: string }> {
    const event = rawPayload as MessengerWebhookEvent;
    try {
      const handled = await this.handleEvent(event);
      return { handled };
    } catch (error) {
      return {
        handled: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private logIncomingWebhookEvent(event: MessengerWebhookEvent): void {
    const eventTypes = [
      event.optin ? 'optin' : null,
      event.postback ? 'postback' : null,
      event.message ? 'message' : null,
      event.referral ? 'referral' : null,
    ].filter(Boolean);

    this.logger.log(`Webhook event: ${eventTypes.join(', ') || 'unknown'}`);
  }

  private extractRefFromEvent(
    event: MessengerWebhookEvent,
  ): string | undefined {
    return (
      event.referral?.ref ??
      event.postback?.referral?.ref ??
      event.message?.referral?.ref ??
      event.optin?.ref
    );
  }

  private async attemptLinkFromEvent(
    psid: string,
    event: MessengerWebhookEvent,
  ): Promise<MessengerLinkAttemptResult> {
    const ref = this.extractRefFromEvent(event);
    if (!ref) {
      return { status: 'no_ref' };
    }

    const outcome = await this.messengerLinkContextService.resolveFromRef(
      psid,
      {
        ref,
        topic: event.optin?.topic,
        cadence: event.optin?.frequency,
      },
    );

    if (outcome.verifyFailureReason) {
      await this.notifyMessengerLinkVerifyFailure(
        psid,
        outcome.verifyFailureReason,
      );
      return { status: 'verify_failed' };
    }

    if (!outcome.context) {
      return { status: 'invalid_ref' };
    }

    const linked = await this.linkPsidFromContext(psid, outcome.context);
    if (linked) {
      return { status: 'linked', context: outcome.context };
    }

    return { status: 'blocked' };
  }

  private async notifyMessengerLinkVerifyFailure(
    psid: string,
    reason: MessengerLinkVerifyFailureReason,
  ): Promise<void> {
    await this.outbound
      .sendTextViaPsid({
        psid,
        text: buildMessengerLinkVerifyFailedMessage(reason),
        messageType: 'MESSENGER_LINK_VERIFY_FAILED',
      })
      .catch(() => undefined);
  }

  private async resolveLinkContextFromMapping(
    psid: string,
  ): Promise<MessengerLinkContext | undefined> {
    const mapping = await this.repository.findActiveMappingByPsid(psid);
    if (!mapping?.userId) {
      return undefined;
    }

    return this.messengerLinkContextService.resolveFromMapping({
      userId: mapping.userId,
      topic: mapping.topic,
      cadence: mapping.cadence,
    });
  }

  private async resolveLinkContextAfterAttempt(
    psid: string,
    event: MessengerWebhookEvent | undefined,
    attempt: MessengerLinkAttemptResult,
  ): Promise<MessengerLinkContext | undefined> {
    if (attempt.status === 'linked' && attempt.context) {
      return attempt.context;
    }

    if (attempt.status === 'blocked' || attempt.status === 'verify_failed') {
      return this.resolveLinkContextFromMapping(psid);
    }

    if (attempt.context) {
      return attempt.context;
    }

    return this.resolveLinkContext(psid, event);
  }

  private linkAttemptBlocksWelcome(
    attempt: MessengerLinkAttemptResult,
  ): boolean {
    return attempt.status === 'blocked' || attempt.status === 'verify_failed';
  }

  private async resolveLinkContext(
    psid: string,
    event?: MessengerWebhookEvent,
  ): Promise<MessengerLinkContext | undefined> {
    if (event) {
      const ref = this.extractRefFromEvent(event);
      if (ref) {
        const outcome = await this.messengerLinkContextService.resolveFromRef(
          psid,
          {
            ref,
            topic: event.optin?.topic,
            cadence: event.optin?.frequency,
          },
        );
        if (outcome.context) {
          return outcome.context;
        }
      }
    }

    return this.resolveLinkContextFromMapping(psid);
  }

  private async linkPsidFromContext(
    psid: string,
    context: MessengerLinkContext,
  ): Promise<boolean> {
    const result = await this.messengerMappingService.linkFromContext(
      psid,
      context,
    );
    return !result.blocked;
  }

  private async resolveUserId(
    psid: string,
    event?: MessengerWebhookEvent,
  ): Promise<number | undefined> {
    const context = await this.resolveLinkContext(psid, event);
    if (context?.userId) {
      return context.userId;
    }

    const mapping = await this.repository.findActiveMappingByPsid(psid);
    return mapping?.userId;
  }

  private async handleEvent(event: MessengerWebhookEvent): Promise<boolean> {
    const psid = event.sender?.id;
    if (!psid) {
      this.logger.warn('Ignored Messenger event without sender.id');
      return false;
    }

    if (event.optin) {
      const linkAttempt = await this.attemptLinkFromEvent(psid, event);

      if (linkAttempt.status === 'linked' && linkAttempt.context) {
        this.logger.log(
          `Linked PSID ${psid} from opt-in (ref=${linkAttempt.context.ref}, topic=${linkAttempt.context.topic}, cadence=${linkAttempt.context.cadence})`,
        );
      } else if (!this.extractRefFromEvent(event)) {
        this.logger.warn(
          `Opt-in for PSID ${psid} missing ref, topic or cadence`,
        );
      }

      return true;
    }

    if (event.referral?.ref && !event.postback && !event.message?.text) {
      await this.attemptLinkFromEvent(psid, event);
      return true;
    }

    const postbackPayload = event.postback?.payload;
    if (postbackPayload) {
      return this.handlePostbackEvent(psid, postbackPayload, event);
    }

    if (event.message?.text) {
      if (event.message.is_echo) {
        this.logger.log(`Ignored echo message for PSID ${psid}`);
        return true;
      }

      const messageMid = event.message.mid;
      if (messageMid && (await this.isDuplicateMessageMid(messageMid, psid))) {
        this.logger.log(
          `Skipping duplicate message mid=${messageMid} for PSID ${psid}`,
        );
        return true;
      }

      const linkAttempt = await this.attemptLinkFromEvent(psid, event);
      const linkedContext = await this.resolveLinkContextAfterAttempt(
        psid,
        event,
        linkAttempt,
      );
      const userId = await this.resolveUserId(psid, event);
      const userText = event.message.text.trim();

      if (!userId) {
        this.signalMessageSeen(psid);
        void this.outbound
          .sendTextViaPsid({
            psid,
            text: getMissingUserRefMessage(),
            messageType: 'MISSING_USER_REF',
          })
          .catch(() => undefined);
        return true;
      }

      if (!messageMid && this.chatRateLimitConfig.shouldEnforceForPsid(psid)) {
        this.logger.warn(
          `Chat text without message.mid psid=${psid}; not enqueued (H5)`,
        );
        this.signalMessageSeen(psid);
        void this.outbound
          .sendTextViaPsid({
            psid,
            userId,
            text: buildChatMissingMidMessage(),
            messageType: 'CHAT_MISSING_MID',
          })
          .catch(() => undefined);
        return true;
      }

      this.messengerChatQueueService.enqueue({
        psid,
        userId,
        userText,
        linkContext:
          linkedContext ??
          (await this.resolveLinkContextAfterAttempt(psid, event, {
            status: 'no_ref',
          })),
        idempotencyKey: messageMid,
      });
      return true;
    }

    if (event.message && !event.message.is_echo) {
      if (isUnsupportedUserMessage(event.message) && !event.postback) {
        const messageMid = event.message.mid;
        if (
          messageMid &&
          (await this.isDuplicateMessageMid(messageMid, psid))
        ) {
          this.logger.log(
            `Skipping duplicate unsupported message mid=${messageMid} for PSID ${psid}`,
          );
          return true;
        }

        this.logger.log(
          `Unsupported message type (L1) for PSID ${psid}; sending text-only guidance`,
        );
        this.signalMessageSeen(psid);
        const userId = await this.resolveUserId(psid, event);
        void this.outbound
          .sendTextViaPsid({
            psid,
            userId,
            text: buildUnsupportedMessageTypeReply(),
            messageType: 'UNSUPPORTED_MESSAGE_TYPE',
          })
          .catch(() => undefined);
        return true;
      }
    }

    this.logger.log(`Ignored unsupported event for PSID ${psid}`);
    return false;
  }

  private async handlePostbackEvent(
    psid: string,
    payload: string,
    event: MessengerWebhookEvent,
  ): Promise<boolean> {
    if (await this.isDuplicatePostback(psid, payload)) {
      this.logger.log(
        `Skipping duplicate postback ${payload} for PSID ${psid}`,
      );
      return true;
    }

    this.signalMessageSeen(psid);

    const linkAttempt = await this.attemptLinkFromEvent(psid, event);
    const context = await this.resolveLinkContextAfterAttempt(
      psid,
      event,
      linkAttempt,
    );

    this.logger.log(`PSID: ${psid}`);
    this.logger.log(`USER_ID: ${context?.userId ?? 'unknown'}`);
    this.logger.log(`POSTBACK: ${payload}`);
    if (context) {
      this.logger.log(
        `REF: ${context.ref}, TOPIC: ${context.topic}, CADENCE: ${context.cadence}`,
      );
    }

    if (
      payload === 'GET_LEARNING_REPORT' ||
      payload === 'SEND_OPT_IN' ||
      payload === 'REGISTER_LEARNING_REPORT'
    ) {
      if (!context) {
        await this.outbound.sendTextViaPsid({
          psid,
          text: getMissingUserRefMessage(),
          messageType: 'MISSING_USER_REF',
        });
        return true;
      }

      await this.signalTyping(psid);
      await this.reportDeliveryService.registerForScheduledReports(
        psid,
        context,
      );
      return true;
    }

    if (
      payload === 'VIEW_LEARNING_PROGRESS' ||
      payload === 'GET_LEARNING_PROGRESS'
    ) {
      await this.signalTyping(psid);
      const userId = await this.resolveUserId(psid);
      await this.reportDeliveryService.sendReport(psid, userId);
      return true;
    }

    if (
      payload === 'VIEW_UPCOMING_STUDY_SESSION' ||
      payload === 'PREVIEW_STUDY_REMINDER'
    ) {
      await this.signalTyping(psid);
      await this.reminderDeliveryService.sendReminderPreview(
        psid,
        context?.userId,
      );
      return true;
    }

    if (payload === CONFIRM_RESCHEDULE_POSTBACK) {
      await this.signalTyping(psid);
      await this.handleConfirmReschedulePostback(psid, context?.userId);
      return true;
    }

    if (payload === CANCEL_RESCHEDULE_POSTBACK) {
      const message = this.rescheduleConfirmationService.cancel(psid);
      await this.outbound.sendTextViaPsid({
        psid,
        userId: context?.userId,
        text: message,
        messageType: 'RESCHEDULE_CANCELLED',
      });
      return true;
    }

    if (payload === 'GET_STARTED') {
      if (this.linkAttemptBlocksWelcome(linkAttempt)) {
        return true;
      }

      await this.signalTyping(psid);
      await this.outbound.sendTextViaPsid({
        psid,
        userId: context?.userId,
        text: await this.buildWelcomeMessage(psid, context?.userId),
        messageType: 'WELCOME',
      });
      return true;
    }

    if (this.linkAttemptBlocksWelcome(linkAttempt)) {
      return true;
    }

    await this.signalTyping(psid);
    await this.outbound.sendTextViaPsid({
      psid,
      userId: context?.userId,
      text: await this.buildWelcomeMessage(psid, context?.userId),
      messageType: 'WELCOME',
    });
    return true;
  }

  private async handleConfirmReschedulePostback(
    psid: string,
    userId?: number,
  ): Promise<void> {
    const result = await this.rescheduleConfirmationService.confirm(
      psid,
      userId,
    );

    if (!result.confirmed) {
      await this.outbound.sendTextViaPsid({
        psid,
        userId,
        text: result.message,
        messageType: 'RESCHEDULE_CONFIRM_FAILED',
      });
      return;
    }

    await this.outbound.sendTextViaPsid({
      psid,
      userId,
      text: [
        `Mình đã dời buổi học sang ${result.scheduledTimeLabel} cho bạn rồi nhé ✅`,
        getStudyReminderLeadTimeNotice(
          this.configService.get<number>('STUDY_REMINDER_MINUTES_BEFORE') ?? 30,
        ),
      ].join('\n\n'),
      messageType: 'RESCHEDULE_CONFIRMED',
    });

    await this.outbound.sendRichFollowUps({
      psid,
      userId,
      followUps: [
        buildRescheduleSuccessRichFollowUp({
          scheduledTimeLabel: result.scheduledTimeLabel,
        }),
      ],
    });
  }

  private signalMessageSeen(psid: string): void {
    void this.outbound.sendSenderActionOptional(psid, 'mark_seen');
  }

  private async signalTyping(psid: string): Promise<void> {
    await this.outbound.sendSenderActionOptional(psid, 'typing_on');
  }

  private isDuplicateMessageMid(mid: string, psid: string): Promise<boolean> {
    return this.webhookDedupeStore.isDuplicateMessageMid(mid, psid);
  }

  private isDuplicatePostback(psid: string, payload: string): Promise<boolean> {
    return this.webhookDedupeStore.isDuplicatePostback(psid, payload);
  }

  private async buildWelcomeMessage(
    psid: string,
    userId?: number,
  ): Promise<string> {
    const displayName = await this.userDisplayNameService.resolveDisplayName({
      psid,
      userId,
    });
    return buildWelcomeMessage(displayName);
  }
}

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
import { MessengerMappingService } from './messenger-mapping.service';
import { MessengerLinkContextService } from './messenger-link-context.service';
import { MessengerOutboundService } from './messenger-outbound.service';
import { MessengerRescheduleConfirmationService } from './messenger-reschedule-confirmation.service';
import { buildMessengerLinkVerifyFailedMessage } from '../messages/messenger-link.messages';
import { buildRescheduleSuccessRichFollowUp } from '../formatters/messenger-rich-message.builder';
import type {
  MessengerLinkAttemptResult,
  MessengerLinkVerifyFailureReason,
} from '../../domain/types/messenger-link-verify.types';
import { MessengerReportDeliveryService } from './messenger-report-delivery.service';
import { MessengerReminderDeliveryService } from './messenger-reminder-delivery.service';
import {
  routeWebhookEvent,
  RouterContext,
  WebhookAction,
} from '../messenger-webhook.router';

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

  private async handleEvent(event: MessengerWebhookEvent): Promise<boolean> {
    const psid = event.sender?.id;
    if (!psid) {
      this.logger.warn('Ignored Messenger event without sender.id');
      return false;
    }

    const ctx = await this.preResolveContext(psid, event);
    const actions = routeWebhookEvent(event, ctx);

    for (const action of actions) {
      await this.executeAction(action, event);
    }

    return actions.length > 0 && actions[0].type !== 'ignore';
  }

  private async preResolveContext(
    psid: string,
    event: MessengerWebhookEvent,
  ): Promise<RouterContext> {
    const isDuplicateMid = event.message?.mid
      ? await this.isDuplicateMessageMid(event.message.mid, psid)
      : undefined;

    const isDuplicatePostback = event.postback?.payload
      ? await this.isDuplicatePostback(psid, event.postback.payload)
      : undefined;

    const existingMapping = await this.repository.findActiveMappingByPsid(psid);

    const shouldEnforceRateLimit =
      this.chatRateLimitConfig.shouldEnforceForPsid(psid);

    // For text/postback events: resolve link context (includes mapping fallback)
    let linkContext: RouterContext['linkContext'] = undefined;
    const linkAttemptStatus: RouterContext['linkAttemptStatus'] = undefined;

    if (!event.optin && !event.referral?.ref) {
      const resolved = await this.resolveLinkContextFromMapping(psid);
      if (resolved) {
        linkContext = resolved;
      }
    }

    return {
      isDuplicateMid,
      isDuplicatePostback,
      userId: existingMapping?.userId,
      linkContext,
      linkAttemptStatus,
      shouldEnforceRateLimit,
    };
  }

  private async executeAction(
    action: WebhookAction,
    event: MessengerWebhookEvent,
  ): Promise<void> {
    const psid = action.type === 'ignore' ? event.sender?.id : action.psid;

    switch (action.type) {
      case 'ignore':
        if (psid) {
          this.logger.log(`Ignored event for PSID ${psid}`);
        }
        break;

      case 'link_user': {
        const linkAttempt = await this.attemptLinkFromEvent(psid!, event);
        if (linkAttempt.status === 'linked' && linkAttempt.context) {
          this.logger.log(
            `Linked PSID ${psid} from opt-in (ref=${linkAttempt.context.ref}, topic=${linkAttempt.context.topic}, cadence=${linkAttempt.context.cadence})`,
          );
        } else if (!this.extractRefFromEvent(event)) {
          this.logger.warn(
            `Opt-in for PSID ${psid} missing ref, topic or cadence`,
          );
        }
        break;
      }

      case 'enqueue_chat': {
        const linkContext = await this.resolveLinkContextForChat(psid!, event);
        this.messengerChatQueueService.enqueue({
          psid: psid!,
          userId: action.userId,
          userText: action.userText,
          linkContext,
          idempotencyKey: action.idempotencyKey,
        });
        break;
      }

      case 'send_text':
        this.signalMessageSeen(psid!);
        void this.outbound
          .sendTextViaPsid({
            psid: psid!,
            userId: action.userId,
            text: action.text,
            messageType: action.messageType,
          })
          .catch(() => undefined);
        break;

      case 'register_report':
        await this.signalTyping(psid!);
        await this.reportDeliveryService.registerForScheduledReports(
          psid!,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
          action as any,
        );
        break;

      case 'send_report':
        await this.signalTyping(psid!);
        await this.reportDeliveryService.sendReport(psid!, action.userId);
        break;

      case 'send_reminder_preview':
        await this.signalTyping(psid!);
        await this.reminderDeliveryService.sendReminderPreview(
          psid!,
          action.userId,
        );
        break;

      case 'confirm_reschedule':
        await this.signalTyping(psid!);
        await this.handleConfirmReschedulePostback(psid!, action.userId);
        break;

      case 'cancel_reschedule': {
        const message = this.rescheduleConfirmationService.cancel(psid!);
        await this.outbound.sendTextViaPsid({
          psid: psid!,
          userId: action.userId,
          text: message,
          messageType: 'RESCHEDULE_CANCELLED',
        });
        break;
      }

      case 'send_welcome':
        await this.signalTyping(psid!);
        await this.outbound.sendTextViaPsid({
          psid: psid!,
          userId: action.userId,
          text: await this.buildWelcomeMessage(psid!, action.userId),
          messageType: 'WELCOME',
        });
        break;
    }
  }

  private async resolveLinkContextForChat(
    psid: string,
    event: MessengerWebhookEvent,
  ): Promise<MessengerLinkContext | undefined> {
    // Try to resolve via ref in event first
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

    // Fallback to existing mapping
    return this.resolveLinkContextFromMapping(psid);
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

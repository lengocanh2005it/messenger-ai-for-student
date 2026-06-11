import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MessengerLinkContext,
  buildMMeLink,
  buildPocPsidToken,
  buildWelcomeMessage,
  getPocAlreadySubscribedMessage,
  getPocSubscriptionConfirmationMessage,
  getMissingUserRefMessage,
  parseMessengerLinkContext,
} from '../config/poc.constants';
import { StudentReportService } from '../student-report/student-report.service';
import { StudyReminderScheduleService } from '../study-reminder/study-reminder-schedule.service';
import { StudyReminderService } from '../study-reminder/study-reminder.service';
import { UserDisplayNameService } from '../study-reminder/user-display-name.service';
import { getNoUpcomingStudySessionMessage } from '../study-reminder/study-reminder.messages';
import { NormalizedStudySession } from '../study-reminder/study-schedule.types';
import { MessengerRepository } from './messenger.repository';
import {
  MessengerWebhookEvent,
  MessengerWebhookPayload,
  UserMessengerMapping,
} from './types';

export class MessengerApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly responseBody: string,
  ) {
    super(message);
    this.name = 'MessengerApiError';
  }
}

@Injectable()
export class MessengerService {
  private readonly logger = new Logger(MessengerService.name);
  private readonly recentPostbacks = new Map<string, number>();
  private static readonly POSTBACK_DEDUPE_MS = 15_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly repository: MessengerRepository,
    private readonly studentReportService: StudentReportService,
    private readonly studyReminderService: StudyReminderService,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
    private readonly userDisplayNameService: UserDisplayNameService,
  ) {}

  verifyWebhook(token?: string, challenge?: string): string {
    if (token !== this.configService.get<string>('VERIFY_TOKEN')) {
      throw new ForbiddenException('Invalid verify token');
    }

    return challenge ?? '';
  }

  buildMMeLink(context: MessengerLinkContext): string {
    const pageRef =
      this.configService.get<string>('MESSENGER_PAGE_USERNAME')?.trim() ||
      this.configService.get<string>('MESSENGER_PAGE_ID')?.trim();

    if (!pageRef) {
      throw new InternalServerErrorException(
        'MESSENGER_PAGE_ID or MESSENGER_PAGE_USERNAME is missing',
      );
    }

    return buildMMeLink(pageRef, context);
  }

  async handleWebhook(payload: MessengerWebhookPayload): Promise<{
    processed: number;
    failures: Array<{ psid?: string; error: string }>;
  }> {
    const failures: Array<{ psid?: string; error: string }> = [];
    let processed = 0;

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
        this.logIncomingWebhookEvent(event);
        try {
          const handled = await this.handleEvent(event);
          processed += handled ? 1 : 0;
        } catch (error) {
          failures.push({
            psid: event.sender?.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return { processed, failures };
  }

  async registerForScheduledReports(
    psid: string,
    context: MessengerLinkContext,
  ): Promise<void> {
    const existing = await this.repository.findActiveMappingByPsid(psid);

    if (
      existing?.cadence === context.cadence &&
      existing?.topic === context.topic
    ) {
      await this.sendTextViaPsid({
        psid,
        userId: existing.userId ?? context.userId,
        text: getPocAlreadySubscribedMessage(),
        messageType: 'SUBSCRIPTION_ALREADY_ACTIVE',
      });
      return;
    }

    await this.repository.upsertPocSubscription({
      psid,
      userId: context.userId,
      cadence: context.cadence,
      topic: context.topic,
      notificationMessagesToken: buildPocPsidToken(psid),
    });

    this.logger.log(
      `Registered PSID ${psid} (userId=${context.userId}, topic=${context.topic}, cadence=${context.cadence})`,
    );

    await this.sendTextViaPsid({
      psid,
      userId: context.userId,
      text: getPocSubscriptionConfirmationMessage(),
      messageType: 'SUBSCRIPTION_CONFIRMATION',
    });
  }

  async sendScheduledReportForMapping(
    mapping: UserMessengerMapping,
  ): Promise<string> {
    if (!mapping.psid) {
      throw new InternalServerErrorException(
        `Mapping ${mapping.id} has no PSID for Send API delivery`,
      );
    }

    const report = await this.studentReportService.generateReport(mapping.psid);

    await this.sendTextViaPsid({
      psid: mapping.psid,
      userId: mapping.userId,
      text: report,
      messageType: 'SCHEDULED_LEARNING_REPORT',
    });

    return report;
  }

  async sendLearningProgressReport(psid: string): Promise<string> {
    const userId = await this.resolveUserId(psid);
    const report = await this.studentReportService.generateReport(psid);
    await this.sendTextViaPsid({
      psid,
      userId,
      text: report,
      messageType: 'LEARNING_PROGRESS',
    });
    return report;
  }

  async sendReportToPsid(psid: string): Promise<string> {
    const userId = await this.resolveUserId(psid);
    const report = await this.studentReportService.generateReport(psid);
    await this.sendTextViaPsid({
      psid,
      userId,
      text: report,
      messageType: 'LEARNING_REPORT',
    });
    return report;
  }

  async sendUpcomingStudySessionReminderPreview(
    psid: string,
    userId?: number,
  ): Promise<string> {
    const resolvedUserId = userId ?? (await this.resolveUserId(psid));
    const session = await this.studyReminderService.getNextUpcomingSession(
      psid,
      resolvedUserId,
    );

    if (!session) {
      const emptyMessage = getNoUpcomingStudySessionMessage(
        this.studyReminderScheduleService.getOutboxSettings().minutesBefore,
      );
      await this.sendTextViaPsid({
        psid,
        userId: resolvedUserId,
        text: emptyMessage,
        messageType: 'STUDY_SESSION_REMINDER_EMPTY',
      });
      return emptyMessage;
    }

    return this.sendStudySessionReminder({
      psid,
      userId: resolvedUserId,
      session,
      messageType: 'STUDY_SESSION_REMINDER_PREVIEW',
    });
  }

  async sendStudySessionReminder(params: {
    psid: string;
    session: NormalizedStudySession;
    messageType: string;
    userId?: number;
    displayName?: string;
  }): Promise<string> {
    const reminder = await this.studyReminderService.generateReminderForSession(
      params.psid,
      params.session,
      { userId: params.userId, displayName: params.displayName },
    );

    await this.sendTextViaPsid({
      psid: params.psid,
      userId: params.userId,
      text: reminder,
      messageType: params.messageType,
    });

    return reminder;
  }

  async sendTextViaPsid(params: {
    psid: string;
    text: string;
    messageType: string;
    userId?: number;
  }): Promise<void> {
    try {
      await this.callSendApiByPsid(params.psid, { text: params.text });
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: params.text,
        status: 'SENT',
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.repository.logMessage({
        userId: params.userId,
        psid: params.psid,
        messageType: params.messageType,
        messageText: params.text,
        status: 'FAILED',
        errorMessage,
      });
      throw error;
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

  private extractLinkContextFromEvent(
    event: MessengerWebhookEvent,
  ): MessengerLinkContext | undefined {
    const ref = this.extractRefFromEvent(event);
    const topic = event.optin?.topic;
    const cadence = event.optin?.frequency;

    return parseMessengerLinkContext({ ref, topic, cadence });
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

  private async resolveLinkContext(
    psid: string,
    event?: MessengerWebhookEvent,
  ): Promise<MessengerLinkContext | undefined> {
    if (event) {
      const fromEvent = this.extractLinkContextFromEvent(event);
      if (fromEvent) {
        return fromEvent;
      }
    }

    const mapping = await this.repository.findActiveMappingByPsid(psid);
    if (!mapping?.userId) {
      return undefined;
    }

    return parseMessengerLinkContext({
      ref: String(mapping.userId),
      topic: mapping.topic,
      cadence: mapping.cadence,
    });
  }

  private async linkPsidFromContext(
    psid: string,
    context: MessengerLinkContext,
  ): Promise<void> {
    await this.repository.upsertPsidUserLink({
      psid,
      userId: context.userId,
      topic: context.topic,
      cadence: context.cadence,
    });
    this.logger.log(
      `Linked PSID ${psid} to userId=${context.userId}, topic=${context.topic}, cadence=${context.cadence}`,
    );
  }

  private async handleEvent(event: MessengerWebhookEvent): Promise<boolean> {
    const psid = event.sender?.id;
    if (!psid) {
      this.logger.warn('Ignored Messenger event without sender.id');
      return false;
    }

    if (event.optin) {
      const context = parseMessengerLinkContext({
        ref: event.optin.ref,
        topic: event.optin.topic,
        cadence: event.optin.frequency,
      });

      if (context) {
        await this.linkPsidFromContext(psid, context);
        this.logger.log(
          `Linked PSID ${psid} from opt-in (ref=${context.ref}, topic=${context.topic}, cadence=${context.cadence})`,
        );
      } else {
        this.logger.warn(
          `Opt-in for PSID ${psid} missing ref, topic or cadence`,
        );
      }

      return true;
    }

    if (event.referral?.ref && !event.postback && !event.message?.text) {
      const context = this.extractLinkContextFromEvent(event);
      if (context) {
        await this.linkPsidFromContext(psid, context);
      }
      return true;
    }

    const postbackPayload = event.postback?.payload;
    if (postbackPayload) {
      return this.handlePostbackEvent(psid, postbackPayload, event);
    }

    if (event.message?.text) {
      const context = this.extractLinkContextFromEvent(event);
      if (context) {
        await this.linkPsidFromContext(psid, context);
      }
      const userId = await this.resolveUserId(psid, event);
      await this.sendTextViaPsid({
        psid,
        userId,
        text: await this.buildWelcomeMessage(psid, userId),
        messageType: 'WELCOME',
      });
      return true;
    }

    this.logger.log(`Ignored unsupported event for PSID ${psid}`);
    return false;
  }

  private async handlePostbackEvent(
    psid: string,
    payload: string,
    event: MessengerWebhookEvent,
  ): Promise<boolean> {
    if (this.isDuplicatePostback(psid, payload)) {
      this.logger.log(
        `Skipping duplicate postback ${payload} for PSID ${psid}`,
      );
      return true;
    }

    const context = await this.resolveLinkContext(psid, event);
    if (context) {
      await this.linkPsidFromContext(psid, context);
    }

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
        await this.sendTextViaPsid({
          psid,
          text: getMissingUserRefMessage(),
          messageType: 'MISSING_USER_REF',
        });
        return true;
      }

      await this.registerForScheduledReports(psid, context);
      return true;
    }

    if (
      payload === 'VIEW_LEARNING_PROGRESS' ||
      payload === 'GET_LEARNING_PROGRESS'
    ) {
      await this.sendLearningProgressReport(psid);
      return true;
    }

    if (
      payload === 'VIEW_UPCOMING_STUDY_SESSION' ||
      payload === 'PREVIEW_STUDY_REMINDER'
    ) {
      await this.sendUpcomingStudySessionReminderPreview(psid, context?.userId);
      return true;
    }

    if (payload === 'GET_STARTED') {
      await this.sendTextViaPsid({
        psid,
        userId: context?.userId,
        text: await this.buildWelcomeMessage(psid, context?.userId),
        messageType: 'WELCOME',
      });
      return true;
    }

    await this.sendTextViaPsid({
      psid,
      userId: context?.userId,
      text: await this.buildWelcomeMessage(psid, context?.userId),
      messageType: 'WELCOME',
    });
    return true;
  }

  private isDuplicatePostback(psid: string, payload: string): boolean {
    const key = `${psid}:${payload}`;
    const now = Date.now();
    const lastSeen = this.recentPostbacks.get(key);

    if (
      lastSeen !== undefined &&
      now - lastSeen < MessengerService.POSTBACK_DEDUPE_MS
    ) {
      return true;
    }

    this.recentPostbacks.set(key, now);

    if (this.recentPostbacks.size > 500) {
      for (const [entryKey, timestamp] of this.recentPostbacks) {
        if (now - timestamp > MessengerService.POSTBACK_DEDUPE_MS) {
          this.recentPostbacks.delete(entryKey);
        }
      }
    }

    return false;
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

  private async callSendApiByPsid(
    psid: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const pageAccessToken = this.configService.get<string>('PAGE_ACCESS_TOKEN');
    const graphApiVersion =
      this.configService.get<string>('GRAPH_API_VERSION') ?? 'v21.0';

    if (!pageAccessToken) {
      throw new InternalServerErrorException('PAGE_ACCESS_TOKEN is missing');
    }

    const url = new URL(
      `https://graph.facebook.com/${graphApiVersion}/me/messages`,
    );
    url.searchParams.set('access_token', pageAccessToken);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: {
          id: psid,
        },
        message,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new MessengerApiError(
        `Messenger Send API failed for PSID ${psid}: HTTP ${response.status} ${response.statusText} - ${body}`,
        response.status,
        response.statusText,
        body,
      );
    }
  }
}

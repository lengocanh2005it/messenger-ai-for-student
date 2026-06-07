import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  POC_CADENCE,
  POC_TOPIC,
  POC_USER_ID,
  buildPocPsidToken,
  getPocAlreadySubscribedMessage,
  getPocMMeLink,
  getPocSubscriptionConfirmationMessage,
  resolvePocUserId,
} from '../config/poc.constants';
import { StudentReportService } from '../student-report/student-report.service';
import { MessengerRepository } from './messenger.repository';
import {
  MessengerWebhookEvent,
  MessengerWebhookPayload,
  UserMessengerMapping,
} from './types';

export const WELCOME_MESSAGE =
  'Chào bạn! WISPACE sẵn sàng. Bấm Get Started hoặc Menu → "Nhận báo cáo học tập" để đăng ký nhận báo cáo AI hàng ngày.';

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
  ) {}

  verifyWebhook(token?: string, challenge?: string): string {
    if (token !== this.configService.get<string>('VERIFY_TOKEN')) {
      throw new ForbiddenException('Invalid verify token');
    }

    return challenge ?? '';
  }

  getMMeLink(userId?: number): string {
    const pageRef =
      this.configService.get<string>('MESSENGER_PAGE_USERNAME') ??
      this.configService.get<string>('MESSENGER_PAGE_ID');

    if (!pageRef) {
      throw new InternalServerErrorException(
        'MESSENGER_PAGE_ID or MESSENGER_PAGE_USERNAME is missing',
      );
    }

    return getPocMMeLink(pageRef, resolvePocUserId(userId ?? POC_USER_ID));
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
    userId?: number,
  ): Promise<void> {
    const resolvedUserId = resolvePocUserId(userId);
    const existing = await this.repository.findActiveMappingByPsid(psid);

    if (existing?.cadence === POC_CADENCE) {
      await this.sendTextViaPsid({
        psid,
        userId: resolvePocUserId(existing.userId),
        text: getPocAlreadySubscribedMessage(),
        messageType: 'SUBSCRIPTION_ALREADY_ACTIVE',
      });
      return;
    }

    await this.repository.upsertPocSubscription({
      psid,
      userId: resolvedUserId,
      cadence: POC_CADENCE,
      topic: POC_TOPIC,
      notificationMessagesToken: buildPocPsidToken(psid),
    });

    this.logger.log(
      `Registered PSID ${psid} for daily reports (userId=${resolvedUserId})`,
    );

    await this.sendTextViaPsid({
      psid,
      userId: resolvedUserId,
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

    const userId = resolvePocUserId(mapping.userId);
    const report = await this.studentReportService.generateReport(userId);

    await this.sendTextViaPsid({
      psid: mapping.psid,
      userId,
      text: report,
      messageType: 'SCHEDULED_LEARNING_REPORT',
    });

    return report;
  }

  async sendReportToPsid(psid: string, userId?: number): Promise<string> {
    const resolvedUserId = resolvePocUserId(userId);
    const report =
      await this.studentReportService.generateReport(resolvedUserId);
    await this.sendTextViaPsid({
      psid,
      userId: resolvedUserId,
      text: report,
      messageType: 'LEARNING_REPORT',
    });
    return report;
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

  private async handleEvent(event: MessengerWebhookEvent): Promise<boolean> {
    if (event.optin) {
      this.logger.log('Ignored Meta opt-in webhook (PSID-only mode)');
      return true;
    }

    const psid = event.sender?.id;
    if (!psid) {
      this.logger.warn('Ignored Messenger event without sender.id');
      return false;
    }

    const postbackPayload = event.postback?.payload;
    if (postbackPayload) {
      return this.handlePostbackEvent(psid, postbackPayload);
    }

    if (event.message?.text) {
      await this.sendTextViaPsid({
        psid,
        userId: POC_USER_ID,
        text: WELCOME_MESSAGE,
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
  ): Promise<boolean> {
    if (this.isDuplicatePostback(psid, payload)) {
      this.logger.log(
        `Skipping duplicate postback ${payload} for PSID ${psid}`,
      );
      return true;
    }

    this.logger.log(`PSID: ${psid}`);
    this.logger.log(`USER_ID: ${POC_USER_ID}`);
    this.logger.log(`POSTBACK: ${payload}`);

    if (
      payload === 'GET_LEARNING_REPORT' ||
      payload === 'SEND_OPT_IN' ||
      payload === 'GET_STARTED'
    ) {
      await this.registerForScheduledReports(psid);
      return true;
    }

    await this.sendTextViaPsid({
      psid,
      userId: POC_USER_ID,
      text: WELCOME_MESSAGE,
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

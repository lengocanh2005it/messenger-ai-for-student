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
  getRecurringNotificationMMeLink,
  isPocPsidToken,
  parseOptinUserId,
  parseOptinUserIdFromPayload,
  resolvePocUserId,
} from '../config/poc.constants';
import { StudentReportService } from '../student-report/student-report.service';
import { MessengerRepository } from './messenger.repository';
import {
  MessengerWebhookEvent,
  MessengerWebhookPayload,
  UserMessengerMapping,
} from './types';

export const OPTIN_CONFIRMATION_MESSAGE =
  'Bạn đã đăng ký nhận báo cáo năng lực qua Messenger thành công. WISPACE sẽ gửi báo cáo AI lúc 08:00 hàng ngày.';

export const OPTIN_ALREADY_ACTIVE_MESSAGE =
  'Bạn đã đăng ký nhận báo cáo rồi. WISPACE sẽ gửi báo cáo AI lúc 08:00 hàng ngày — không cần bấm lại.';

export const OPTIN_PROMPT_MESSAGE =
  'Bấm "Opt in" trên thẻ Meta phía trên để đăng ký nhận báo cáo AI lúc 08:00 hàng ngày.';

export const OPTIN_FALLBACK_MESSAGE =
  'Không hiển thị được thẻ opt-in Meta. Bấm link bên dưới để mở trang đăng ký. Nếu vẫn lỗi, admin cần chạy register-topic trước.';

export const WELCOME_MESSAGE =
  'Chào bạn! WISPACE sẵn sàng. Bấm Get Started hoặc mở Menu → "Đăng ký nhận báo cáo" để bật thẻ Nhận tin của Meta.';

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

    return getRecurringNotificationMMeLink(
      pageRef,
      resolvePocUserId(userId ?? POC_USER_ID),
    );
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

  async sendNotificationOptInRequest(
    psid: string,
    options?: { registerTopic?: boolean; userId?: number },
  ): Promise<void> {
    const existing = await this.repository.findActiveMetaTokenMappingByPsid(psid);
    if (existing && !options?.registerTopic) {
      await this.sendTextViaPsid({
        psid,
        userId: existing.userId,
        text: OPTIN_ALREADY_ACTIVE_MESSAGE,
        messageType: 'OPTIN_ALREADY_ACTIVE',
      });
      return;
    }

    const title =
      this.configService.get<string>('MESSENGER_OPT_IN_TITLE') ??
      'Báo cáo học tập WISPACE';
    const userId = resolvePocUserId(options?.userId);
    const payload = options?.registerTopic
      ? `Registering topic: ${POC_TOPIC}`
      : `topic:${POC_TOPIC};ref:${userId}`;

    await this.callSendApiByPsid(psid, {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'notification_messages',
          title,
          payload,
          notification_messages_cta_text: 'OPT_IN',
        },
      },
    });

    this.logger.log(
      `Sent Meta opt-in template to PSID ${psid} (topic=${POC_TOPIC}, cadence=${POC_CADENCE})`,
    );

    await this.repository.logMessage({
      userId,
      psid,
      messageType: options?.registerTopic
        ? 'TOPIC_REGISTRATION_OPTIN'
        : 'OPTIN_REQUEST',
      messageText: title,
      status: 'SENT',
    });
  }

  async registerNotificationTopic(psid: string): Promise<void> {
    await this.sendNotificationOptInRequest(psid, { registerTopic: true });
  }

  async syncNotificationTokensFromMeta(): Promise<{
    synced: number;
    tokens: Array<{ psid: string; token: string; title?: string }>;
  }> {
    const pageId = this.configService.get<string>('MESSENGER_PAGE_ID');
    const pageAccessToken = this.configService.get<string>('PAGE_ACCESS_TOKEN');
    const graphApiVersion =
      this.configService.get<string>('GRAPH_API_VERSION') ?? 'v21.0';

    if (!pageId || !pageAccessToken) {
      throw new InternalServerErrorException(
        'MESSENGER_PAGE_ID or PAGE_ACCESS_TOKEN is missing',
      );
    }

    const url = new URL(
      `https://graph.facebook.com/${graphApiVersion}/${pageId}/notification_message_tokens`,
    );
    url.searchParams.set('access_token', pageAccessToken);
    url.searchParams.set('limit', '100');

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `Meta notification_message_tokens failed: HTTP ${response.status} - ${body}`,
      );
    }

    const data = (await response.json()) as {
      data?: Array<{
        notification_messages_token: string;
        recipient_id: string;
        topic_title?: string;
      }>;
    };

    const syncedTokens: Array<{ psid: string; token: string; title?: string }> =
      [];

    for (const item of data.data ?? []) {
      const mapping = await this.repository.upsertFromOptin({
        psid: item.recipient_id,
        userId: POC_USER_ID,
        notificationMessagesToken: item.notification_messages_token,
        cadence: POC_CADENCE,
        topic: POC_TOPIC,
      });

      syncedTokens.push({
        psid: item.recipient_id,
        token: item.notification_messages_token,
        title: item.topic_title,
      });

      this.logger.log(
        `Synced token from Meta API for PSID ${mapping.psid}: ${item.notification_messages_token}`,
      );
    }

    return {
      synced: syncedTokens.length,
      tokens: syncedTokens,
    };
  }

  private logIncomingWebhookEvent(event: MessengerWebhookEvent): void {
    const eventTypes = [
      event.optin ? 'optin' : null,
      event.postback ? 'postback' : null,
      event.message ? 'message' : null,
      event.referral ? 'referral' : null,
    ].filter(Boolean);

    this.logger.log(`Webhook event: ${eventTypes.join(', ') || 'unknown'}`);

    if (event.optin) {
      this.logger.log(`Optin webhook: ${JSON.stringify(event.optin)}`);
    }
  }

  async sendScheduledReportForMapping(
    mapping: UserMessengerMapping,
  ): Promise<string> {
    const userId = resolvePocUserId(mapping.userId);
    const report = await this.studentReportService.generateReport(userId);

    if (isPocPsidToken(mapping.notificationMessagesToken) && mapping.psid) {
      await this.sendTextViaPsid({
        psid: mapping.psid,
        userId,
        text: report,
        messageType: 'SCHEDULED_LEARNING_REPORT',
      });
      return report;
    }

    if (!mapping.psid) {
      await this.sendTextViaToken({
        notificationMessagesToken: mapping.notificationMessagesToken,
        userId,
        psid: mapping.psid,
        text: report,
        messageType: 'SCHEDULED_LEARNING_REPORT',
      });
      return report;
    }

    try {
      await this.callSendApi({
        notificationMessagesToken: mapping.notificationMessagesToken,
        text: report,
      });
      await this.repository.logMessage({
        userId,
        psid: mapping.psid,
        messageType: 'SCHEDULED_LEARNING_REPORT',
        messageText: report,
        status: 'SENT',
      });
    } catch (error) {
      if (this.shouldFallbackToPsidSend(error)) {
        this.logger.warn(
          `Meta notification token send blocked for PSID ${mapping.psid}, falling back to PSID Send API`,
        );
        await this.sendTextViaPsid({
          psid: mapping.psid,
          userId,
          text: report,
          messageType: 'SCHEDULED_LEARNING_REPORT_PSID_FALLBACK',
        });
        return report;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.repository.logMessage({
        userId,
        psid: mapping.psid,
        messageType: 'SCHEDULED_LEARNING_REPORT',
        messageText: report,
        status: 'FAILED',
        errorMessage,
      });
      throw error;
    }

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

  async sendReportToToken(
    notificationMessagesToken: string,
    userId?: number,
  ): Promise<string> {
    const resolvedUserId = resolvePocUserId(userId);
    const report =
      await this.studentReportService.generateReport(resolvedUserId);
    await this.sendTextViaToken({
      notificationMessagesToken,
      userId: resolvedUserId,
      text: report,
      messageType: 'LEARNING_REPORT',
    });
    return report;
  }

  async sendTextViaToken(params: {
    notificationMessagesToken: string;
    text: string;
    messageType: string;
    userId?: number;
    psid?: string;
  }): Promise<void> {
    try {
      await this.callSendApi({
        notificationMessagesToken: params.notificationMessagesToken,
        text: params.text,
      });
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

  private async handleEvent(event: MessengerWebhookEvent): Promise<boolean> {
    if (event.optin?.notification_messages_token) {
      return this.handleOptinEvent(event);
    }

    if (event.optin) {
      this.logger.warn(
        `Received optin webhook without token: ${JSON.stringify(event.optin)}`,
      );
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
      await this.sendOptInPromptViaPsid(psid);
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

  private async sendOptInPromptViaPsid(psid: string): Promise<void> {
    try {
      await this.sendNotificationOptInRequest(psid);
    } catch (error) {
      const detail =
        error instanceof MessengerApiError
          ? error.responseBody
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.error(
        `Meta opt-in template failed for PSID ${psid}: ${detail}`,
      );
      await this.sendOptInFallbackViaPsid(psid);
    }
  }

  private async sendOptInFallbackViaPsid(psid: string): Promise<void> {
    const mMeLink = this.getMMeLink(POC_USER_ID);

    await this.callSendApiByPsid(psid, {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: OPTIN_FALLBACK_MESSAGE,
          buttons: [
            {
              type: 'web_url',
              title: 'Mở link đăng ký',
              url: mMeLink,
              webview_height_ratio: 'full',
            },
          ],
        },
      },
    });

    await this.repository.logMessage({
      userId: POC_USER_ID,
      psid,
      messageType: 'OPTIN_FALLBACK_LINK',
      messageText: mMeLink,
      status: 'SENT',
    });
  }

  private async handleOptinEvent(
    event: MessengerWebhookEvent,
  ): Promise<boolean> {
    const psid = event.sender?.id;
    const optin = event.optin;

    if (!optin?.notification_messages_token) {
      throw new InternalServerErrorException(
        'notification_messages opt-in missing token',
      );
    }

    const userId = optin.ref
      ? parseOptinUserId(optin.ref)
      : parseOptinUserIdFromPayload(optin.payload);
    const cadence = optin.frequency ?? POC_CADENCE;
    const topic = optin.topic ?? POC_TOPIC;

    const mapping = await this.repository.upsertFromOptin({
      psid,
      userId,
      notificationMessagesToken: optin.notification_messages_token,
      cadence,
      topic,
    });

    this.logger.log(`PSID: ${psid ?? 'unknown'}`);
    this.logger.log(`USER_ID: ${userId}`);
    this.logger.log(`REF: ${optin.ref ?? POC_USER_ID}`);
    this.logger.log(`TOKEN: ${optin.notification_messages_token}`);
    this.logger.log(`CADENCE: ${cadence}`);
    this.logger.log(`TOPIC: ${topic}`);

    await this.sendOptinConfirmation(mapping);
    return true;
  }

  private async sendOptinConfirmation(
    mapping: UserMessengerMapping,
  ): Promise<void> {
    try {
      await this.sendTextViaToken({
        notificationMessagesToken: mapping.notificationMessagesToken,
        userId: mapping.userId,
        psid: mapping.psid,
        text: OPTIN_CONFIRMATION_MESSAGE,
        messageType: 'OPTIN_CONFIRMATION',
      });
    } catch (error) {
      if (mapping.psid && this.shouldFallbackToPsidSend(error)) {
        this.logger.warn(
          `Opt-in confirmation via token blocked, falling back to PSID ${mapping.psid}`,
        );
        await this.sendTextViaPsid({
          psid: mapping.psid,
          userId: mapping.userId,
          text: OPTIN_CONFIRMATION_MESSAGE,
          messageType: 'OPTIN_CONFIRMATION_PSID_FALLBACK',
        });
        return;
      }

      throw error;
    }
  }

  private shouldFallbackToPsidSend(error: unknown): boolean {
    if (!(error instanceof MessengerApiError)) {
      return false;
    }

    return (
      error.responseBody.includes('4017186') ||
      error.responseBody.includes('Marketing Messages access is not allowed') ||
      error.responseBody.includes('Recurring Notifications') ||
      error.responseBody.includes('deprecated')
    );
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

  private async callSendApi(params: {
    notificationMessagesToken: string;
    text: string;
  }): Promise<void> {
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
          notification_messages_token: params.notificationMessagesToken,
        },
        message: {
          text: params.text,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new MessengerApiError(
        `Messenger Send API failed for token ${params.notificationMessagesToken}: HTTP ${response.status} ${response.statusText} - ${body}`,
        response.status,
        response.statusText,
        body,
      );
    }
  }
}

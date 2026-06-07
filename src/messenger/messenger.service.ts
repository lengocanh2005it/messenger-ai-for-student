import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StudentReportService } from '../student-report/student-report.service';
import { MessengerRepository } from './messenger.repository';
import {
  MessengerWebhookEvent,
  MessengerWebhookPayload,
  NotificationCadence,
  UserMessengerMapping,
} from './types';

export const OPTIN_CONFIRMATION_MESSAGE =
  'Bạn đã đăng ký nhận báo cáo năng lực qua Messenger thành công. WISPACE sẽ gửi báo cáo theo lịch bạn chọn.';

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

  getMMeLink(
    userId: string | number,
    topic = 'ai_capacity_report',
    cadence: NotificationCadence = 'DAILY',
  ): string {
    const pageId = this.configService.get<string>('MESSENGER_PAGE_ID');

    if (!pageId) {
      throw new InternalServerErrorException('MESSENGER_PAGE_ID is missing');
    }

    const url = new URL(`https://m.me/${pageId}`);
    url.searchParams.set('topic', topic);
    url.searchParams.set('cadence', cadence);
    url.searchParams.set('ref', String(userId));

    return url.toString();
  }

  async handleWebhook(payload: MessengerWebhookPayload): Promise<{
    processed: number;
    failures: Array<{ psid?: string; error: string }>;
  }> {
    const failures: Array<{ psid?: string; error: string }> = [];
    let processed = 0;

    for (const entry of payload.entry ?? []) {
      for (const event of entry.messaging ?? []) {
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

  async sendReportToToken(
    notificationMessagesToken: string,
    userId = 0,
  ): Promise<string> {
    const report = await this.studentReportService.generateReport(userId);
    await this.sendTextViaToken({
      notificationMessagesToken,
      userId,
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
    if (event.optin?.type === 'notification_messages') {
      return this.handleOptinEvent(event);
    }

    const psid = event.sender?.id;
    if (!psid) {
      this.logger.warn('Ignored Messenger event without sender.id');
      return false;
    }

    this.logger.log(
      `Ignored non-optin event for PSID ${psid}. Subscribe via notification_messages opt-in.`,
    );
    return false;
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

    const ref = optin.ref;
    const userId = this.resolveUserId(ref);
    const cadence = this.normalizeCadence(optin.frequency);
    const topic = optin.topic ?? 'ai_capacity_report';

    const mapping = await this.repository.upsertFromOptin({
      psid,
      userId,
      notificationMessagesToken: optin.notification_messages_token,
      cadence,
      topic,
    });

    this.logger.log(`PSID: ${psid ?? 'unknown'}`);
    if (ref) {
      this.logger.log(`REF: ${ref}`);
    }
    this.logger.log(`TOKEN: ${optin.notification_messages_token}`);
    this.logger.log(`CADENCE: ${cadence ?? 'unknown'}`);
    this.logger.log(`TOPIC: ${topic}`);

    await this.sendOptinConfirmation(mapping);
    return true;
  }

  private async sendOptinConfirmation(
    mapping: UserMessengerMapping,
  ): Promise<void> {
    await this.sendTextViaToken({
      notificationMessagesToken: mapping.notificationMessagesToken,
      userId: mapping.userId,
      psid: mapping.psid,
      text: OPTIN_CONFIRMATION_MESSAGE,
      messageType: 'OPTIN_CONFIRMATION',
    });
  }

  private resolveUserId(ref?: string): number | undefined {
    if (!ref || !/^\d+$/.test(ref)) {
      return undefined;
    }

    return Number(ref);
  }

  private normalizeCadence(
    frequency?: string,
  ): NotificationCadence | undefined {
    if (frequency === 'DAILY' || frequency === 'WEEKLY' || frequency === 'MONTHLY') {
      return frequency;
    }

    return undefined;
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

import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  POC_CADENCE,
  POC_TOPIC,
  POC_USER_ID,
} from '../config/poc.constants';
import { MessengerProfileService } from './messenger-profile.service';
import { MessengerService } from './messenger.service';
import type { MessengerWebhookPayload } from './types';

@Controller()
export class MessengerController {
  constructor(
    private readonly messengerService: MessengerService,
    private readonly messengerProfileService: MessengerProfileService,
  ) {}

  @Get('webhook')
  verifyWebhook(
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    return this.messengerService.verifyWebhook(token, challenge);
  }

  @Post('webhook')
  @HttpCode(200)
  async receiveWebhook(@Body() payload: MessengerWebhookPayload) {
    if (payload.object !== 'page') {
      throw new NotFoundException('Unsupported webhook object');
    }

    const result = await this.messengerService.handleWebhook(payload);

    if (result.failures.length > 0) {
      return {
        ok: false,
        ...result,
      };
    }

    return {
      ok: true,
      ...result,
    };
  }

  @Get('messenger/m-me-link')
  getPocMMeLink() {
    return {
      userId: POC_USER_ID,
      topic: POC_TOPIC,
      cadence: POC_CADENCE,
      url: this.messengerService.getMMeLink(POC_USER_ID),
    };
  }

  @Get('messenger/m-me-link/:userId')
  getMMeLink(@Param('userId') userId: string) {
    const parsedUserId = Number.parseInt(userId, 10);
    return {
      userId: Number.isFinite(parsedUserId) ? parsedUserId : POC_USER_ID,
      topic: POC_TOPIC,
      cadence: POC_CADENCE,
      url: this.messengerService.getMMeLink(
        Number.isFinite(parsedUserId) ? parsedUserId : POC_USER_ID,
      ),
    };
  }

  @Post('messenger/notifications/register-topic')
  @HttpCode(200)
  async registerTopic(@Body() body: { psid: string }) {
    await this.messengerService.registerNotificationTopic(body.psid);
    return {
      ok: true,
      message:
        'Sent topic registration opt-in. Open Messenger, click the opt-in button, then check webhook logs for tkn_...',
    };
  }

  @Post('messenger/notifications/sync-tokens')
  @HttpCode(200)
  syncTokens() {
    return this.messengerService.syncNotificationTokensFromMeta();
  }

  @Post('messenger/notifications/send-optin')
  @HttpCode(200)
  async sendOptIn(
    @Body()
    body: {
      psid: string;
      userId?: number;
    },
  ) {
    await this.messengerService.sendNotificationOptInRequest(body.psid, {
      userId: body.userId,
    });
    return {
      ok: true,
      message: 'Sent Meta opt-in template. User must click the opt-in button.',
    };
  }

  @Post('messenger/test-send')
  @HttpCode(200)
  async testSend(
    @Body()
    body: {
      notification_messages_token: string;
      userId?: number;
    },
  ) {
    const report = await this.messengerService.sendReportToToken(
      body.notification_messages_token,
      body.userId,
    );

    return {
      ok: true,
      message: report,
    };
  }

  @Post('messenger/profile/setup')
  @HttpCode(200)
  setupProfile() {
    return this.messengerProfileService.setupProfile();
  }
}

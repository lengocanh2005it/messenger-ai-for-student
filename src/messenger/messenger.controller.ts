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
import { MessengerProfileService } from './messenger-profile.service';
import { MessengerService } from './messenger.service';
import type { MessengerWebhookPayload, NotificationCadence } from './types';

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

  @Get('messenger/m-me-link/:userId')
  getMMeLink(
    @Param('userId') userId: string,
    @Query('topic') topic?: string,
    @Query('cadence') cadence?: NotificationCadence,
  ) {
    return {
      url: this.messengerService.getMMeLink(
        userId,
        topic,
        cadence ?? 'DAILY',
      ),
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
      body.userId ?? 0,
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

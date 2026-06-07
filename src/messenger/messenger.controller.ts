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

  @Post('messenger/test-send')
  @HttpCode(200)
  async testSend(
    @Body()
    body: {
      psid: string;
      userId?: number;
    },
  ) {
    const report = await this.messengerService.sendReportToPsid(
      body.psid,
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

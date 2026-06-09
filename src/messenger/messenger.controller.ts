import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { parseMessengerLinkContext } from '../config/poc.constants';
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
  getMMeLink(
    @Query('ref') ref?: string,
    @Query('topic') topic?: string,
    @Query('cadence') cadence?: string,
  ) {
    const context = parseMessengerLinkContext({ ref, topic, cadence });
    if (!context) {
      throw new BadRequestException(
        'Query params ref, topic and cadence are required. ref is userId.',
      );
    }

    return {
      ref: context.ref,
      topic: context.topic,
      cadence: context.cadence,
      userId: context.userId,
      url: this.messengerService.buildMMeLink(context),
    };
  }

  @Post('messenger/test-send')
  @HttpCode(200)
  async testSend(
    @Body()
    body: {
      psid: string;
    },
  ) {
    const report = await this.messengerService.sendReportToPsid(body.psid);

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

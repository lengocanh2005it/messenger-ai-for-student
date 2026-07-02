import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DiscordAccountLinkService } from '../../application/services/discord-account-link.service';
import { WispaceDiscordTokenVerifyService } from '../../infrastructure/wispace/wispace-discord-token-verify.service';
import { DiscordOutboundService } from '../../../discord-chat/application/services/discord-outbound.service';

const WELCOME_MESSAGE =
  'Đã kết nối tài khoản WISPACE với Discord thành công! Bạn có thể hỏi mình về tiến độ học, lịch học, mục tiêu band ngay trong DM này.';

@Controller('discord/oauth')
export class DiscordOauthController {
  private readonly logger = new Logger(DiscordOauthController.name);

  constructor(
    private readonly tokenVerifyService: WispaceDiscordTokenVerifyService,
    private readonly accountLinkService: DiscordAccountLinkService,
    private readonly outboundService: DiscordOutboundService,
  ) {}

  /** `state` carries WISPACE's own link token verbatim (WISPACE owns its expiry/usage state). */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!code || !token) {
      this.sendResultPage(res, false, 'Thiếu code hoặc token.');
      return;
    }

    try {
      const discordUserId =
        await this.accountLinkService.exchangeCodeForDiscordUserId(code);

      const verifyResult = await this.tokenVerifyService.verifyToken(
        token,
        discordUserId,
      );

      if (!verifyResult.valid) {
        this.sendResultPage(res, false, 'Link đã hết hạn hoặc không hợp lệ.');
        return;
      }

      await this.accountLinkService.upsertLink(
        verifyResult.userId,
        discordUserId,
      );

      await this.outboundService.sendText(discordUserId, WELCOME_MESSAGE);
      this.sendResultPage(res, true);
    } catch (error) {
      this.logger.error(
        `Discord OAuth callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.sendResultPage(res, false, 'Có lỗi xảy ra, vui lòng thử lại.');
    }
  }

  private sendResultPage(
    res: Response,
    success: boolean,
    message?: string,
  ): void {
    const title = success ? 'Kết nối thành công' : 'Kết nối thất bại';
    const body = success
      ? 'Bạn đã kết nối Discord với WISPACE thành công. Có thể đóng tab này và quay lại Discord.'
      : (message ?? 'Có lỗi xảy ra.');

    res.status(success ? 200 : 400).type('html').send(`
      <!doctype html>
      <html lang="vi">
        <head><meta charset="utf-8"><title>${title}</title></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 3rem;">
          <h2>${title}</h2>
          <p>${body}</p>
        </body>
      </html>
    `);
  }
}

import { Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { DiscordAccountLinkService } from '../../application/services/discord-account-link.service';
import { WispaceDiscordTokenVerifyService } from '../../infrastructure/wispace/wispace-discord-token-verify.service';
import { DiscordOutboundService } from '../../../discord-chat/application/services/discord-outbound.service';
import { buildDiscordLinkWelcomeMessage } from '../../application/messages/account-link.messages';

@Controller('discord/oauth')
export class DiscordOauthController {
  private readonly logger = new Logger(DiscordOauthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenVerifyService: WispaceDiscordTokenVerifyService,
    private readonly accountLinkService: DiscordAccountLinkService,
    private readonly outboundService: DiscordOutboundService,
  ) {}

  /**
   * Returns the Discord OAuth2 authorization URL.
   * The `state` param must come from WISPACE's link-token API.
   * For local dev, set DISCORD_DEV_LINK_TOKEN in .env as a test state value.
   */
  @Get('url')
  getOAuthUrl(
    @Query('state') stateOverride: string | undefined,
    @Res() res: Response,
  ): void {
    const clientId = this.configService.getOrThrow<string>('DISCORD_CLIENT_ID');
    const redirectUri = this.configService.getOrThrow<string>(
      'DISCORD_OAUTH_REDIRECT_URI',
    );
    const state =
      stateOverride?.trim() ||
      this.configService.get<string>('DISCORD_DEV_LINK_TOKEN') ||
      '';

    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    if (state) url.searchParams.set('state', state);

    res.json({ url: url.toString() });
  }

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
      const discordUser =
        await this.accountLinkService.exchangeCodeForDiscordUser(code);
      const { id: discordUserId, username: discordUsername } = discordUser;

      // Dev bypass: skip WISPACE verify when DISCORD_DEV_LINK_TOKEN matches
      const devToken = this.configService.get<string>('DISCORD_DEV_LINK_TOKEN');
      const devUserId = this.configService.get<string>(
        'DISCORD_DEV_LINK_USER_ID',
      );

      if (devToken && devUserId && token === devToken) {
        this.logger.warn(
          `Dev bypass: skipping WISPACE verify for token=${token.slice(0, 8)}…`,
        );
        await this.accountLinkService.upsertLink(
          Number(devUserId),
          discordUserId,
        );
        const dmChannelId = await this.outboundService.sendTextAndGetChannelId(
          discordUserId,
          buildDiscordLinkWelcomeMessage(discordUsername),
        );
        const botId =
          this.configService.getOrThrow<string>('DISCORD_CLIENT_ID');
        this.sendResultPage(
          res,
          true,
          undefined,
          botId,
          dmChannelId,
          discordUsername,
        );
        return;
      }

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

      const dmChannelId = await this.outboundService.sendTextAndGetChannelId(
        discordUserId,
        buildDiscordLinkWelcomeMessage(discordUsername),
      );
      const botUserId =
        this.configService.getOrThrow<string>('DISCORD_CLIENT_ID');
      this.sendResultPage(
        res,
        true,
        undefined,
        botUserId,
        dmChannelId,
        discordUsername,
      );
    } catch (error) {
      this.logger.error(
        `Discord OAuth callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.sendResultPage(res, false, 'Có lỗi xảy ra, vui lòng thử lại.');
    }
  }

  /**
   * Redirects to DISCORD_OAUTH_FRONTEND_CALLBACK_URL if set (dev/prod FE),
   * otherwise falls back to a minimal inline HTML page.
   */
  private sendResultPage(
    res: Response,
    success: boolean,
    message?: string,
    botUserId?: string,
    dmChannelId?: string,
    discordUsername?: string,
  ): void {
    const frontendUrl = this.configService.get<string>(
      'DISCORD_OAUTH_FRONTEND_CALLBACK_URL',
    );

    if (frontendUrl) {
      const url = new URL(frontendUrl);
      if (!success) url.searchParams.set('error', message ?? 'Có lỗi xảy ra.');
      if (botUserId) url.searchParams.set('botUserId', botUserId);
      if (dmChannelId) url.searchParams.set('dmChannelId', dmChannelId);
      if (discordUsername)
        url.searchParams.set('discordUsername', discordUsername);
      res.redirect(url.toString());
      return;
    }

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

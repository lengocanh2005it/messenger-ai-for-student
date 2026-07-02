/* eslint-disable @typescript-eslint/unbound-method -- Jest mock method assertions */
import type { Response } from 'express';
import { DiscordOauthController } from './discord-oauth.controller';
import type { DiscordAccountLinkService } from '../../application/services/discord-account-link.service';
import type { WispaceDiscordTokenVerifyService } from '../../infrastructure/wispace/wispace-discord-token-verify.service';
import type { DiscordOutboundService } from '../../../discord-chat/application/services/discord-outbound.service';

function buildResponse(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('DiscordOauthController', () => {
  it('returns 400 when code or state is missing', async () => {
    const tokenVerifyService = {
      verifyToken: jest.fn(),
    } as unknown as WispaceDiscordTokenVerifyService;
    const accountLinkService = {
      exchangeCodeForDiscordUserId: jest.fn(),
    } as unknown as DiscordAccountLinkService;
    const outboundService = {} as DiscordOutboundService;
    const controller = new DiscordOauthController(
      tokenVerifyService,
      accountLinkService,
      outboundService,
    );
    const res = buildResponse();

    await controller.callback(undefined, 'token', res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(
      accountLinkService.exchangeCodeForDiscordUserId,
    ).not.toHaveBeenCalled();
  });

  it('returns 400 when the WISPACE token is invalid', async () => {
    const tokenVerifyService = {
      verifyToken: jest
        .fn()
        .mockResolvedValue({ valid: false, reason: 'EXPIRED' }),
    } as unknown as WispaceDiscordTokenVerifyService;
    const accountLinkService = {
      exchangeCodeForDiscordUserId: jest
        .fn()
        .mockResolvedValue('discord-user-1'),
      upsertLink: jest.fn(),
    } as unknown as DiscordAccountLinkService;
    const outboundService = {
      sendText: jest.fn(),
    } as unknown as DiscordOutboundService;
    const controller = new DiscordOauthController(
      tokenVerifyService,
      accountLinkService,
      outboundService,
    );
    const res = buildResponse();

    await controller.callback('code', 'bad-token', res);

    expect(tokenVerifyService.verifyToken).toHaveBeenCalledWith(
      'bad-token',
      'discord-user-1',
    );
    expect(accountLinkService.upsertLink).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('links the account and sends a welcome DM on success', async () => {
    const tokenVerifyService = {
      verifyToken: jest.fn().mockResolvedValue({ valid: true, userId: 143 }),
    } as unknown as WispaceDiscordTokenVerifyService;
    const accountLinkService = {
      exchangeCodeForDiscordUserId: jest
        .fn()
        .mockResolvedValue('discord-user-1'),
      upsertLink: jest.fn().mockResolvedValue(undefined),
    } as unknown as DiscordAccountLinkService;
    const outboundService = {
      sendText: jest.fn().mockResolvedValue(undefined),
    } as unknown as DiscordOutboundService;
    const controller = new DiscordOauthController(
      tokenVerifyService,
      accountLinkService,
      outboundService,
    );
    const res = buildResponse();

    await controller.callback('code', 'good-token', res);

    expect(
      accountLinkService.exchangeCodeForDiscordUserId,
    ).toHaveBeenCalledWith('code');
    expect(accountLinkService.upsertLink).toHaveBeenCalledWith(
      143,
      'discord-user-1',
    );
    expect(outboundService.sendText).toHaveBeenCalledWith(
      'discord-user-1',
      expect.any(String),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 400 when the Discord code exchange fails', async () => {
    const tokenVerifyService = {
      verifyToken: jest.fn(),
    } as unknown as WispaceDiscordTokenVerifyService;
    const accountLinkService = {
      exchangeCodeForDiscordUserId: jest
        .fn()
        .mockRejectedValue(new Error('Discord token exchange failed: 400')),
    } as unknown as DiscordAccountLinkService;
    const outboundService = {} as DiscordOutboundService;
    const controller = new DiscordOauthController(
      tokenVerifyService,
      accountLinkService,
      outboundService,
    );
    const res = buildResponse();

    await controller.callback('code', 'good-token', res);

    expect(tokenVerifyService.verifyToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

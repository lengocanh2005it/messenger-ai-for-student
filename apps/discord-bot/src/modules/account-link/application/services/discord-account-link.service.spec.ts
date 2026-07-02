import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { DiscordAccountLinkEntity } from '../../../../infrastructure/database/entities/discord-account-link.entity';
import { DiscordAccountLinkService } from './discord-account-link.service';

const CONFIG_VALUES: Record<string, string> = {
  DISCORD_CLIENT_ID: 'client-id',
  DISCORD_CLIENT_SECRET: 'client-secret',
  DISCORD_OAUTH_REDIRECT_URI: 'https://bot.example.com/discord/oauth/callback',
};

function buildConfigService(): ConfigService {
  return {
    getOrThrow: (key: string) => CONFIG_VALUES[key],
  } as unknown as ConfigService;
}

describe('DiscordAccountLinkService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('exchangeCodeForDiscordUserId', () => {
    it('exchanges the code for a token then fetches the Discord user id', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ access_token: 'discord-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'discord-user-1' }),
        });
      global.fetch = fetchMock;

      const repo = {} as Repository<DiscordAccountLinkEntity>;
      const service = new DiscordAccountLinkService(buildConfigService(), repo);

      const discordUserId =
        await service.exchangeCodeForDiscordUserId('auth-code');

      expect(discordUserId).toBe('discord-user-1');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://discord.com/api/oauth2/token',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://discord.com/api/users/@me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer discord-token' },
        }),
      );
    });

    it('throws when the token exchange fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });

      const repo = {} as Repository<DiscordAccountLinkEntity>;
      const service = new DiscordAccountLinkService(buildConfigService(), repo);

      await expect(
        service.exchangeCodeForDiscordUserId('bad-code'),
      ).rejects.toThrow('Discord token exchange failed: 400');
    });
  });

  describe('upsertLink / findUserIdByDiscordId', () => {
    it('upserts via raw SQL with platform=discord', async () => {
      const query = jest.fn().mockResolvedValue([]);
      const repo = {
        manager: { query },
      } as unknown as Repository<DiscordAccountLinkEntity>;
      const service = new DiscordAccountLinkService(buildConfigService(), repo);

      await service.upsertLink(143, 'discord-user-1');

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO discord_account_links'),
        ['discord', 'discord-user-1', 143],
      );
    });

    it('returns the linked userId when found', async () => {
      const findOne = jest.fn().mockResolvedValue({ userId: 143 });
      const repo = {
        findOne,
      } as unknown as Repository<DiscordAccountLinkEntity>;
      const service = new DiscordAccountLinkService(buildConfigService(), repo);

      await expect(
        service.findUserIdByDiscordId('discord-user-1'),
      ).resolves.toBe(143);
    });

    it('returns undefined when no link exists', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const repo = {
        findOne,
      } as unknown as Repository<DiscordAccountLinkEntity>;
      const service = new DiscordAccountLinkService(buildConfigService(), repo);

      await expect(
        service.findUserIdByDiscordId('discord-user-unknown'),
      ).resolves.toBeUndefined();
    });
  });
});

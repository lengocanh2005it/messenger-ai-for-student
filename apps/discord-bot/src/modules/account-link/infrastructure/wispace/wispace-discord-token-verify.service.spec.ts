/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest.fn() mock of global.fetch */
import { ConfigService } from '@nestjs/config';
import { WispaceDiscordTokenVerifyService } from './wispace-discord-token-verify.service';

const CONFIG_VALUES: Record<string, string> = {
  WISPACE_API_VERIFY_DISCORD_TOKEN_URL:
    'https://backend.example.com/api/User/verify-discord-token',
  WISPACE_INTERNAL_KEY: 'internal-key',
};

function buildConfigService(): ConfigService {
  return {
    get: (key: string) => CONFIG_VALUES[key],
  } as unknown as ConfigService;
}

describe('WispaceDiscordTokenVerifyService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends token, value and platform=discord to the verify URL', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ userId: 143 })),
    });
    global.fetch = fetchMock;

    const service = new WispaceDiscordTokenVerifyService(buildConfigService());
    const result = await service.verifyToken('link-token', 'discord-user-1');

    expect(result).toEqual({ valid: true, userId: 143 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example.com/api/User/verify-discord-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Internal-Key': 'internal-key' }),
        body: JSON.stringify({
          token: 'link-token',
          value: 'discord-user-1',
          platform: 'discord',
        }),
      }),
    );
  });

  it('returns a failure reason from a non-ok response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(JSON.stringify({ reason: 'NOT_FOUND' })),
    });

    const service = new WispaceDiscordTokenVerifyService(buildConfigService());

    await expect(
      service.verifyToken('bad-token', 'discord-user-1'),
    ).resolves.toEqual({ valid: false, reason: 'NOT_FOUND' });
  });

  it('throws when the verify URL is unset', async () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService;
    const service = new WispaceDiscordTokenVerifyService(config);

    await expect(
      service.verifyToken('token', 'discord-user-1'),
    ).rejects.toThrow('WISPACE_API_VERIFY_DISCORD_TOKEN_URL must be set');
  });
});

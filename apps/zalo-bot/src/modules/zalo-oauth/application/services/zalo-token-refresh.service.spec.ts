import { ZaloTokenRefreshService } from './zalo-token-refresh.service';
import { ZaloTokenService } from './zalo-token.service';

describe('ZaloTokenRefreshService', () => {
  it('delegates to ZaloTokenService.refreshNow on the scheduled tick', async () => {
    const refreshNow = jest.fn().mockResolvedValue(undefined);
    const tokenService = { refreshNow } as unknown as ZaloTokenService;

    const service = new ZaloTokenRefreshService(tokenService);
    await service.handleCron();

    expect(refreshNow).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows errors so one failed tick does not crash the cron', async () => {
    const refreshNow = jest.fn().mockRejectedValue(new Error('network down'));
    const tokenService = { refreshNow } as unknown as ZaloTokenService;

    const service = new ZaloTokenRefreshService(tokenService);

    await expect(service.handleCron()).resolves.toBeUndefined();
  });
});

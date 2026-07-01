import type { RedisClientPort } from '../../domain/redis.client.port';
import { RedisConfigService } from './redis-config.service';
import { RedisStartupService } from './redis-startup.service';

describe('RedisStartupService', () => {
  const createService = (params: {
    enabled: boolean;
    pingResult: Awaited<ReturnType<RedisClientPort['ping']>>;
  }) => {
    const redisConfig = {
      isEnabled: () => params.enabled,
      getHost: () => '127.0.0.1',
      getPort: () => 6379,
    } as RedisConfigService;

    const ping = jest.fn().mockResolvedValue(params.pingResult);
    const redisClient = {
      ping,
    } as unknown as RedisClientPort;

    const service = new RedisStartupService(redisConfig, redisClient);
    const logger = {
      log: jest.fn(),
      error: jest.fn(),
    };
    (service as unknown as { logger: typeof logger }).logger = logger;

    return { service, ping, logger };
  };

  it('logs disabled when Redis is off', async () => {
    const { service, ping, logger } = createService({
      enabled: false,
      pingResult: { status: 'disabled' },
    });

    await service.onModuleInit();

    expect(ping).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      'Redis disabled (REDIS_ENABLED=false)',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not log success when ping is ok (logged by IoredisRedisClient)', async () => {
    const { service, ping, logger } = createService({
      enabled: true,
      pingResult: { status: 'ok', latencyMs: 3 },
    });

    await service.onModuleInit();

    expect(ping).toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs error when ping fails', async () => {
    const { service, logger } = createService({
      enabled: true,
      pingResult: { status: 'error', message: 'connection refused' },
    });

    await service.onModuleInit();

    expect(logger.error).toHaveBeenCalledWith(
      'Redis PING failed (127.0.0.1:6379): connection refused',
    );
  });
});

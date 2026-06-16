import { RedisConfigService } from '../application/services/redis-config.service';
import { IoredisRedisClient } from './ioredis.client';

describe('IoredisRedisClient', () => {
  it('returns disabled ping when Redis is off', async () => {
    const redisConfig = {
      isEnabled: () => false,
      getHost: () => '127.0.0.1',
      getPort: () => 6379,
      getPassword: () => undefined,
    } as RedisConfigService;

    const client = new IoredisRedisClient(redisConfig);

    await expect(client.ping()).resolves.toEqual({ status: 'disabled' });
    expect(client.getNativeClient()).toBeNull();
  });
});

describe('IoredisRedisClient (enabled)', () => {
  let client: IoredisRedisClient;
  let mockRedis: {
    ping: jest.Mock;
    quit: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      status: 'wait',
    };

    const redisConfig = {
      isEnabled: () => true,
      getHost: () => '127.0.0.1',
      getPort: () => 6379,
      getPassword: () => 'secret',
    } as RedisConfigService;

    client = new IoredisRedisClient(redisConfig);
    (client as unknown as { client: typeof mockRedis }).client = mockRedis;
  });

  it('pings successfully and logs PING OK once', async () => {
    const logSpy = jest
      .spyOn(
        (client as unknown as { logger: { log: (message: string) => void } })
          .logger,
        'log',
      )
      .mockImplementation(() => undefined);

    const result = await client.ping();

    expect(result.status).toBe('ok');
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(mockRedis.connect).toHaveBeenCalled();
    expect(mockRedis.ping).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^Redis PING OK \(127\.0\.0\.1:6379, \d+ms\)$/),
    );

    await client.ping();
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });

  it('returns error when ping response is unexpected', async () => {
    mockRedis.ping.mockResolvedValueOnce('NOPE');

    await expect(client.ping()).resolves.toEqual({
      status: 'error',
      message: 'Unexpected PING response: NOPE',
    });
  });

  it('returns error when ping throws', async () => {
    mockRedis.ping.mockRejectedValueOnce(new Error('connection refused'));

    await expect(client.ping()).resolves.toEqual({
      status: 'error',
      message: 'connection refused',
    });
  });
});

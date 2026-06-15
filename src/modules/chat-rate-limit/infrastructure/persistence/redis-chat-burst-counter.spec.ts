import type { RedisClientPort } from '../../../../infrastructure/redis/domain/redis.client.port';
import { RedisChatBurstCounter } from './redis-chat-burst-counter';

describe('RedisChatBurstCounter', () => {
  const createCounter = (
    client: {
      get: jest.Mock;
      incr: jest.Mock;
      expire: jest.Mock;
      decr: jest.Mock;
      del: jest.Mock;
    } | null,
  ) => {
    const redisClient = {
      isEnabled: () => client !== null,
      getNativeClient: () => client,
      ping: jest.fn(),
    } as unknown as RedisClientPort;

    return new RedisChatBurstCounter(redisClient);
  };

  it('increments burst key with ttl on first reservation', async () => {
    const client = {
      get: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      decr: jest.fn(),
      del: jest.fn(),
    };

    const counter = createCounter(client);
    await counter.recordReservation('psid-1');

    expect(client.incr).toHaveBeenCalled();
    expect(client.expire).toHaveBeenCalledWith(expect.any(String), 120);
  });

  it('releases burst slot by decrementing key', async () => {
    const client = {
      get: jest.fn().mockResolvedValue('2'),
      incr: jest.fn(),
      expire: jest.fn(),
      decr: jest.fn().mockResolvedValue(1),
      del: jest.fn(),
    };

    const counter = createCounter(client);
    await counter.releaseReservation('psid-1');

    expect(client.decr).toHaveBeenCalled();
  });
});

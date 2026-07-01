import { ChatBurstCounterResolver } from './chat-burst-counter.resolver';
import { MemoryChatBurstCounter } from './memory-chat-burst-counter';
import { PostgresChatBurstCounter } from './postgres-chat-burst-counter';
import { RedisChatBurstCounter } from './redis-chat-burst-counter';
import { ChatRateLimitConfigService } from '../../application/services/chat-rate-limit-config.service';

describe('ChatBurstCounterResolver', () => {
  const createResolver = (
    configured: 'memory' | 'postgres' | 'redis',
    redisAvailable = true,
  ) => {
    const configService = {
      getBurstStore: () => configured,
    } as ChatRateLimitConfigService;

    const memoryCounter = {
      getBurstCount: jest.fn(),
    } as unknown as MemoryChatBurstCounter;
    const postgresCounter = {
      getBurstCount: jest.fn(),
    } as unknown as PostgresChatBurstCounter;
    const redisCounter = {
      isAvailable: () => redisAvailable,
      getBurstCount: jest.fn(),
    } as unknown as RedisChatBurstCounter;

    return new ChatBurstCounterResolver(
      configService,
      memoryCounter,
      postgresCounter,
      redisCounter,
    );
  };

  it('defaults to postgres store kind', () => {
    expect(createResolver('postgres').resolveStoreKind()).toBe('postgres');
  });

  it('falls back to postgres when redis is unavailable', () => {
    expect(createResolver('redis', false).resolveStoreKind()).toBe('postgres');
  });
});

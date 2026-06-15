import { ChatHistoryStoreResolver } from './chat-history.store.resolver';
import { MemoryChatHistoryStore } from './memory-chat-history.store';
import { PostgresChatHistoryStore } from './postgres-chat-history.store';
import { RedisChatHistoryStore } from './redis-chat-history.store';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';

describe('ChatHistoryStoreResolver', () => {
  const createResolver = (
    configured: 'memory' | 'postgres' | 'redis',
    redisAvailable = true,
  ) => {
    const sharedConfig = {
      getHistoryStore: () => configured,
    } as MessengerChatSharedConfigService;

    const memoryStore = {
      getHistory: jest.fn(),
    } as unknown as MemoryChatHistoryStore;
    const postgresStore = {
      getHistory: jest.fn(),
    } as unknown as PostgresChatHistoryStore;
    const redisStore = {
      isAvailable: () => redisAvailable,
      getHistory: jest.fn(),
    } as unknown as RedisChatHistoryStore;

    const resolver = new ChatHistoryStoreResolver(
      sharedConfig,
      memoryStore,
      postgresStore,
      redisStore,
    );

    return { resolver, memoryStore, postgresStore, redisStore };
  };

  it('resolves redis when configured and available', () => {
    const { resolver } = createResolver('redis', true);
    expect(resolver.resolveStoreKind()).toBe('redis');
  });

  it('falls back to memory when redis configured but unavailable', () => {
    const { resolver } = createResolver('redis', false);
    expect(resolver.resolveStoreKind()).toBe('memory');
  });

  it('resolves postgres when configured', () => {
    const { resolver } = createResolver('postgres');
    expect(resolver.resolveStoreKind()).toBe('postgres');
  });

  it('resolves memory by default', () => {
    const { resolver } = createResolver('memory');
    expect(resolver.resolveStoreKind()).toBe('memory');
  });
});

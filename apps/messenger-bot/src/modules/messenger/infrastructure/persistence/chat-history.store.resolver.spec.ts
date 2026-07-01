import { ChatHistoryStoreResolver } from './chat-history.store.resolver';
import { MemoryChatHistoryStore } from './memory-chat-history.store';
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
    const redisStore = {
      isAvailable: () => redisAvailable,
      getHistory: jest.fn(),
    } as unknown as RedisChatHistoryStore;

    return new ChatHistoryStoreResolver(sharedConfig, memoryStore, redisStore);
  };

  it('resolves redis when configured and available', () => {
    expect(createResolver('redis', true).resolveStoreKind()).toBe('redis');
  });

  it('falls back to memory when redis configured but unavailable', () => {
    expect(createResolver('redis', false).resolveStoreKind()).toBe('memory');
  });

  it('falls back to memory when postgres configured (table removed)', () => {
    expect(createResolver('postgres').resolveStoreKind()).toBe('memory');
  });

  it('resolves memory by default', () => {
    expect(createResolver('memory').resolveStoreKind()).toBe('memory');
  });
});

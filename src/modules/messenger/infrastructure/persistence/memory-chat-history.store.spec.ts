import { MemoryChatHistoryStore } from './memory-chat-history.store';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';

describe('MemoryChatHistoryStore', () => {
  const createStore = (ttlMs = 30 * 60 * 1000, maxMessages = 12) => {
    const sharedConfig = {
      getHistoryTtlMs: () => ttlMs,
      getHistoryMaxMessages: () => maxMessages,
    } as MessengerChatSharedConfigService;

    return new MemoryChatHistoryStore(sharedConfig);
  };

  it('returns empty history for new psid', async () => {
    const store = createStore();
    await expect(store.getHistory('psid-1')).resolves.toEqual([]);
  });

  it('stores and returns recent turns', async () => {
    const store = createStore();

    await store.appendTurn('psid-1', 'đổi lịch', 'Buổi nào bạn muốn dời?');
    await store.appendTurn('psid-1', 'ok', 'Đã dời lịch cho bạn.');

    await expect(store.getHistory('psid-1')).resolves.toEqual([
      { role: 'user', content: 'đổi lịch' },
      { role: 'assistant', content: 'Buổi nào bạn muốn dời?' },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'Đã dời lịch cho bạn.' },
    ]);
  });

  it('clears history for psid', async () => {
    const store = createStore();
    await store.appendTurn('psid-1', 'hi', 'hello');
    await store.clear('psid-1');
    await expect(store.getHistory('psid-1')).resolves.toEqual([]);
  });

  it('expires stale history by ttl', async () => {
    const store = createStore(1_000);
    await store.appendTurn('psid-1', 'hi', 'hello');

    const state = (
      store as unknown as {
        store: Map<string, { updatedAt: number }>;
      }
    ).store.get('psid-1');
    if (state) {
      state.updatedAt = Date.now() - 2_000;
    }

    await expect(store.getHistory('psid-1')).resolves.toEqual([]);
  });
});

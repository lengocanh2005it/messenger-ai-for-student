import { MemoryChatHistoryStore } from '../../infrastructure/persistence/memory-chat-history.store';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';
import { MessengerChatHistoryService } from './messenger-chat-history.service';

describe('MessengerChatHistoryService', () => {
  const createService = () => {
    const sharedConfig = {
      getHistoryTtlMs: () => 30 * 60 * 1000,
      getHistoryMaxMessages: () => 12,
    } as MessengerChatSharedConfigService;

    const store = new MemoryChatHistoryStore(sharedConfig);
    return new MessengerChatHistoryService(store);
  };

  it('returns empty history for new psid', async () => {
    const service = createService();
    await expect(service.getHistory('psid-1')).resolves.toEqual([]);
  });

  it('stores and returns recent turns', async () => {
    const service = createService();

    await service.appendTurn('psid-1', 'đổi lịch', 'Buổi nào bạn muốn dời?');
    await service.appendTurn('psid-1', 'ok', 'Đã dời lịch cho bạn.');

    await expect(service.getHistory('psid-1')).resolves.toEqual([
      { role: 'user', content: 'đổi lịch' },
      { role: 'assistant', content: 'Buổi nào bạn muốn dời?' },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'Đã dời lịch cho bạn.' },
    ]);
  });

  it('clears history for psid', async () => {
    const service = createService();
    await service.appendTurn('psid-1', 'hi', 'hello');
    await service.clear('psid-1');
    await expect(service.getHistory('psid-1')).resolves.toEqual([]);
  });
});

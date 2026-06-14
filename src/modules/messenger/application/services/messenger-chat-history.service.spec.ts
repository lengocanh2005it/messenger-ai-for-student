import { MessengerChatHistoryService } from './messenger-chat-history.service';

describe('MessengerChatHistoryService', () => {
  it('returns empty history for new psid', async () => {
    const service = new MessengerChatHistoryService();
    await expect(service.getHistory('psid-1')).resolves.toEqual([]);
  });

  it('stores and returns recent turns', async () => {
    const service = new MessengerChatHistoryService();

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
    const service = new MessengerChatHistoryService();
    await service.appendTurn('psid-1', 'hi', 'hello');
    await service.clear('psid-1');
    await expect(service.getHistory('psid-1')).resolves.toEqual([]);
  });
});

import { MessengerChatHistoryService } from './messenger-chat-history.service';

describe('MessengerChatHistoryService', () => {
  it('returns empty history for new psid', () => {
    const service = new MessengerChatHistoryService();
    expect(service.getHistory('psid-1')).toEqual([]);
  });

  it('stores and returns recent turns', () => {
    const service = new MessengerChatHistoryService();

    service.appendTurn('psid-1', 'đổi lịch', 'Buổi nào bạn muốn dời?');
    service.appendTurn('psid-1', 'ok', 'Đã dời lịch cho bạn.');

    expect(service.getHistory('psid-1')).toEqual([
      { role: 'user', content: 'đổi lịch' },
      { role: 'assistant', content: 'Buổi nào bạn muốn dời?' },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'Đã dời lịch cho bạn.' },
    ]);
  });

  it('clears history for psid', () => {
    const service = new MessengerChatHistoryService();
    service.appendTurn('psid-1', 'hi', 'hello');
    service.clear('psid-1');
    expect(service.getHistory('psid-1')).toEqual([]);
  });
});

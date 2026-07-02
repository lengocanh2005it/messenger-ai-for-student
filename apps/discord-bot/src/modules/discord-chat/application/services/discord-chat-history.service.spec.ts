import { ConfigService } from '@nestjs/config';
import { DiscordChatHistoryService } from './discord-chat-history.service';

describe('DiscordChatHistoryService', () => {
  let service: DiscordChatHistoryService;

  beforeEach(() => {
    const configService = { get: () => undefined } as unknown as ConfigService;
    service = new DiscordChatHistoryService(configService);
  });

  it('returns empty history for a user with no prior turns', async () => {
    await expect(service.getHistory('user-1')).resolves.toEqual([]);
  });

  it('appends user + assistant messages in order', async () => {
    await service.appendTurn('user-1', 'hello', 'hi there');

    await expect(service.getHistory('user-1')).resolves.toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]);
  });

  it('keeps history isolated per user', async () => {
    await service.appendTurn('user-1', 'a', 'b');
    await service.appendTurn('user-2', 'c', 'd');

    await expect(service.getHistory('user-1')).resolves.toHaveLength(2);
    await expect(service.getHistory('user-2')).resolves.toEqual([
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
    ]);
  });

  it('trims history to the most recent 10 turns (20 messages)', async () => {
    for (let i = 0; i < 15; i++) {
      await service.appendTurn('user-1', `q${i}`, `a${i}`);
    }

    const history = await service.getHistory('user-1');
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: 'user', content: 'q5' });
    expect(history[history.length - 1]).toEqual({
      role: 'assistant',
      content: 'a14',
    });
  });
});

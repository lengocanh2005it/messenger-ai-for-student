import { ConfigService } from '@nestjs/config';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';

describe('MessengerChatSharedConfigService', () => {
  const createService = (env: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => env[key]),
    } as unknown as ConfigService;

    return new MessengerChatSharedConfigService(configService);
  };

  it('defaults history store to memory', () => {
    const service = createService({});
    expect(service.getHistoryStore()).toBe('memory');
  });

  it('uses postgres history when shared queue is enabled without explicit store', () => {
    const service = createService({
      CHAT_QUEUE_SHARED: 'true',
    });
    expect(service.getHistoryStore()).toBe('postgres');
  });

  it('reads explicit CHAT_HISTORY_STORE', () => {
    const service = createService({
      CHAT_HISTORY_STORE: 'redis',
      CHAT_QUEUE_SHARED: 'true',
    });
    expect(service.getHistoryStore()).toBe('redis');
  });

  it('defaults dedupe store to memory', () => {
    const service = createService({});
    expect(service.getDedupeStore()).toBe('memory');
  });

  it('uses postgres dedupe when shared queue is enabled without explicit store', () => {
    const service = createService({
      CHAT_QUEUE_SHARED: 'true',
    });
    expect(service.getDedupeStore()).toBe('postgres');
  });

  it('reads explicit CHAT_DEDUPE_STORE', () => {
    const service = createService({
      CHAT_DEDUPE_STORE: 'redis',
      CHAT_QUEUE_SHARED: 'true',
    });
    expect(service.getDedupeStore()).toBe('redis');
  });
});

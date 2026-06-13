import type { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';
import type { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import { MessengerChatQueueService } from './messenger-chat-queue.service';

describe('MessengerChatQueueService shared mode (H7)', () => {
  const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('appends to shared buffer and schedules flush', async () => {
    jest.useFakeTimers();

    const appendChatBuffer = jest.fn(() => Promise.resolve());
    const claimReadyBuffer = jest.fn(() => Promise.resolve(null));
    const completeChatBuffer = jest.fn(() => Promise.resolve(false));
    const sharedState = {
      appendChatBuffer,
      claimReadyBuffer,
      completeChatBuffer,
    } as unknown as MessengerChatSharedStateRepositoryPort;

    const sharedConfig = {
      isSharedQueueEnabled: () => true,
      getProcessingStuckMs: () => 300_000,
    } as MessengerChatSharedConfigService;

    const sendSenderAction = jest.fn(() => Promise.resolve());
    const service = new MessengerChatQueueService(
      { get: () => '0' } as never,
      { sendSenderAction } as never,
      {} as never,
      { getHistory: jest.fn(() => Promise.resolve([])) } as never,
      {
        shouldEnforceForPsid: jest.fn(() => false),
        getSettings: jest.fn(() => ({ mergedTextMaxChars: 4000 })),
      } as never,
      {} as never,
      sharedConfig,
      sharedState,
    );

    service.enqueue({
      psid: 'psid-shared',
      userText: 'hello',
      idempotencyKey: 'mid-1',
    });

    await flushMicrotasks();

    expect(appendChatBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        psid: 'psid-shared',
        userText: 'hello',
        idempotencyKey: 'mid-1',
      }),
    );

    jest.runOnlyPendingTimers();
    await flushMicrotasks();

    expect(claimReadyBuffer).toHaveBeenCalledWith(
      'psid-shared',
      0,
      300_000,
    );

    jest.useRealTimers();
  });
});

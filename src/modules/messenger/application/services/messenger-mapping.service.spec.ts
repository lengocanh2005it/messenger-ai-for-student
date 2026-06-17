import { MessengerMappingService } from './messenger-mapping.service';

describe('MessengerMappingService', () => {
  it('detects relink when user_id changes for same PSID (L3)', async () => {
    const repository = {
      findActiveMappingByPsid: jest.fn(() =>
        Promise.resolve({ userId: 100, psid: 'psid-1' }),
      ),
      upsertPsidUserLink: jest.fn(() =>
        Promise.resolve({
          id: 1,
          userId: 200,
          psid: 'psid-1',
          notificationMessagesToken: 'token',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ),
    };

    const outbound = {
      sendTextViaPsid: jest.fn(() => Promise.resolve()),
    };

    const studyReminderSyncService = {
      syncUpcomingSessions: jest.fn(() => Promise.resolve({})),
    };

    const service = new MessengerMappingService(
      repository as never,
      outbound as never,
      studyReminderSyncService as never,
    );

    const result = await service.relinkPsidToUserId({
      psid: 'psid-1',
      userId: 200,
      allowRelink: true,
    });

    expect(result.relinked).toBe(true);
    expect(result.previousUserId).toBe(100);
    expect(outbound.sendTextViaPsid).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'MAPPING_USER_ID_UPDATED' }),
    );
    expect(studyReminderSyncService.syncUpcomingSessions).toHaveBeenCalledWith({
      userId: 200,
    });
  });

  it('blocks relink for webhook flow unless allowRelink is true (L4)', async () => {
    const repository = {
      findActiveMappingByPsid: jest.fn(() =>
        Promise.resolve({ userId: 100, psid: 'psid-1' }),
      ),
      upsertPsidUserLink: jest.fn(),
    };

    const outbound = {
      sendTextViaPsid: jest.fn(() => Promise.resolve()),
    };

    const studyReminderSyncService = {
      syncUpcomingSessions: jest.fn(() => Promise.resolve({})),
    };

    const service = new MessengerMappingService(
      repository as never,
      outbound as never,
      studyReminderSyncService as never,
    );

    const result = await service.linkFromContext('psid-1', {
      ref: 'token-b',
      userId: 200,
      topic: 'IELTS',
      cadence: 'WEEKLY',
    });

    expect(result.blocked).toBe(true);
    expect(repository.upsertPsidUserLink).not.toHaveBeenCalled();
    expect(outbound.sendTextViaPsid).toHaveBeenCalledWith(
      expect.objectContaining({ messageType: 'MAPPING_RELINK_BLOCKED' }),
    );
  });
});

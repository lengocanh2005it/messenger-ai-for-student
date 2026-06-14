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
});

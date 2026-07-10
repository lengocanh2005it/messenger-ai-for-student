import { ReportCronService } from './report-cron.service';

describe('ReportCronService.sendScheduledReports (R5 ops)', () => {
  const mapping = {
    id: 1,
    psid: 'psid-1',
    userId: 10,
    notificationMessagesToken: 'tok-1',
    topic: 'ielts',
    cadence: 'weekly' as const,
    status: 'ACTIVE' as const,
  };

  const buildService = (overrides?: {
    alreadySent?: boolean;
    claimOk?: boolean;
  }) => {
    const messengerRepository = {
      cleanupActiveDuplicateMappings: jest.fn().mockResolvedValue(0),
      findActiveSubscribedMappings: jest.fn().mockResolvedValue([mapping]),
      hasSentScheduledReportToday: jest
        .fn()
        .mockResolvedValue(overrides?.alreadySent ?? false),
      tryClaimScheduledReport: jest
        .fn()
        .mockResolvedValue(overrides?.claimOk ?? true),
      markScheduledReportClaimSent: jest.fn().mockResolvedValue(undefined),
      releaseScheduledReportClaim: jest.fn().mockResolvedValue(undefined),
    };

    const reportScheduleService = {
      getExamReminderWindow: jest
        .fn()
        .mockReturnValue({ minDays: 2, maxDays: 3 }),
      shouldSendReportToday: jest.fn().mockResolvedValue({
        shouldSend: true,
        examDate: '2026-06-15',
        daysUntilExam: 2,
        minDays: 2,
        maxDays: 3,
      }),
    };

    const messengerReportDeliveryService = {
      sendReportForMapping: jest.fn().mockResolvedValue('report text'),
    };

    const reportSendJobRepository = {
      markSentByPsidExamDate: jest.fn().mockResolvedValue(undefined),
      recordRetryableFailure: jest.fn(),
    };

    const service = new ReportCronService(
      messengerRepository as never,
      messengerReportDeliveryService as never,
      reportScheduleService as never,
      {} as never,
      {} as never,
      { get: jest.fn() } as never,
      reportSendJobRepository as never,
      { getOutboxSettings: jest.fn() } as never,
    );

    return {
      service,
      messengerRepository,
      messengerReportDeliveryService,
      reportSendJobRepository,
    };
  };

  it('forceSend skips user who already received scheduled report today', async () => {
    const { service, messengerReportDeliveryService } = buildService({
      alreadySent: true,
    });

    const result = await service.sendScheduledReports({
      forceSend: true,
      psid: 'psid-1',
    });

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(
      messengerReportDeliveryService.sendReportForMapping,
    ).not.toHaveBeenCalled();
  });

  it('forceSend sends when allowDuplicate bypasses skip', async () => {
    const { service, messengerReportDeliveryService } = buildService({
      alreadySent: true,
    });

    const result = await service.sendScheduledReports({
      forceSend: true,
      psid: 'psid-1',
      allowDuplicate: true,
    });

    expect(result.sent).toBe(1);
    expect(
      messengerReportDeliveryService.sendReportForMapping,
    ).toHaveBeenCalled();
  });

  it('forceSend marks outbox sent when skipping already-sent user', async () => {
    const { service, reportSendJobRepository } = buildService({
      alreadySent: true,
    });

    await service.sendScheduledReports({
      forceSend: true,
      psid: 'psid-1',
    });

    expect(reportSendJobRepository.markSentByPsidExamDate).toHaveBeenCalledWith(
      'psid-1',
      '2026-06-15',
    );
  });
});

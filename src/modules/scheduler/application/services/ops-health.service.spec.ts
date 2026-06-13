import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatQuotaOpsService } from '../../../chat-rate-limit/application/services/chat-quota-ops.service';
import { StudyReminderOpsService } from '../../../study-reminder/application/services/study-reminder-ops.service';
import { MESSENGER_REPOSITORY } from '../../../messenger/domain/repositories/messenger.repository.port';
import { OpsHealthService } from './ops-health.service';

describe('OpsHealthService', () => {
  let service: OpsHealthService;

  const chatQuotaOpsService = {
    getSummary: jest.fn(),
  };

  const studyReminderOpsService = {
    getSummary: jest.fn(),
  };

  const messengerRepository = {
    countMessageLogsByTypeSince: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsHealthService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const values: Record<string, string> = {
                OPS_ALERT_FAILED_JOBS_HOURS: '24',
                OPS_ALERT_STUCK_PROCESSING_MINUTES: '10',
                OPS_ALERT_DENY_LOOKBACK_HOURS: '24',
                OPS_ALERT_MIN_FAILED_JOBS: '1',
                OPS_ALERT_MIN_STUCK_RESERVED: '1',
                OPS_ALERT_MIN_STUCK_PROCESSING: '1',
              };
              return values[key];
            },
          },
        },
        {
          provide: ChatQuotaOpsService,
          useValue: chatQuotaOpsService,
        },
        {
          provide: StudyReminderOpsService,
          useValue: studyReminderOpsService,
        },
        {
          provide: MESSENGER_REPOSITORY,
          useValue: messengerRepository,
        },
      ],
    }).compile();

    service = module.get(OpsHealthService);
  });

  it('builds alerts when terminal failed jobs exist (S1)', async () => {
    chatQuotaOpsService.getSummary.mockResolvedValue({
      usageDate: '2026-06-13',
      stuckReserved: 0,
      stuckReservedMs: 600_000,
      denyLogs24h: 0,
      usersAtDailyLimit: 0,
      dailyLimit: 15,
      idempotencyByStatus: {},
      logGrepHints: ['CHAT_QUOTA_DENY'],
    });
    studyReminderOpsService.getSummary.mockResolvedValue({
      countsByStatus: { failed: 2 },
      terminalFailedSince: 2,
      stuckProcessing: 0,
      failedHours: 24,
      stuckProcessingMinutes: 10,
      samples: { terminalFailed: [], stuckProcessing: [] },
    });
    messengerRepository.countMessageLogsByTypeSince.mockResolvedValue(0);

    const snapshot = await service.collectSnapshot();

    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'STUDY_REMINDER_TERMINAL_FAILED' }),
      ]),
    );
  });

  it('builds alert for stuck reserved idempotency (I1)', async () => {
    chatQuotaOpsService.getSummary.mockResolvedValue({
      usageDate: '2026-06-13',
      stuckReserved: 3,
      stuckReservedMs: 600_000,
      denyLogs24h: 0,
      usersAtDailyLimit: 1,
      dailyLimit: 15,
      idempotencyByStatus: { reserved: 3 },
      logGrepHints: ['CHAT_QUOTA_DENY'],
    });
    studyReminderOpsService.getSummary.mockResolvedValue({
      countsByStatus: { pending: 1 },
      terminalFailedSince: 0,
      stuckProcessing: 0,
      failedHours: 24,
      stuckProcessingMinutes: 10,
      samples: { terminalFailed: [], stuckProcessing: [] },
    });
    messengerRepository.countMessageLogsByTypeSince.mockResolvedValue(5);

    const snapshot = await service.collectSnapshot();

    expect(snapshot.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CHAT_QUOTA_STUCK_RESERVED' }),
      ]),
    );
    expect(snapshot.chatQuota.denyLogs24h).toBe(5);
  });
});

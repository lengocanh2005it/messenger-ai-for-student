import { StudyReminderCleanupService } from './study-reminder-cleanup.service';
import { StudyReminderJobRepository } from '../../infrastructure/persistence/study-reminder-job.repository';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';

describe('StudyReminderCleanupService', () => {
  const deleteSentJobs = jest.fn();
  const deleteTerminalJobsOlderThan = jest.fn();

  const jobRepository = {
    deleteSentJobs,
    deleteTerminalJobsOlderThan,
  } as unknown as StudyReminderJobRepository;

  const scheduleService = {
    getOutboxSettings: jest.fn().mockReturnValue({ jobRetentionDays: 7 }),
  } as unknown as StudyReminderScheduleService;

  const service = new StudyReminderCleanupService(
    jobRepository,
    scheduleService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('purges all sent jobs during evening rollover', async () => {
    deleteSentJobs.mockResolvedValue(4);

    await expect(service.purgeSentJobs()).resolves.toEqual({ deleted: 4 });
    expect(deleteSentJobs).toHaveBeenCalledTimes(1);
  });

  it('purges only old cancelled/failed terminal jobs at 03:00 cleanup', async () => {
    deleteTerminalJobsOlderThan.mockResolvedValue(2);

    const result = await service.purgeExpiredJobs();

    expect(result.deleted).toBe(2);
    expect(deleteTerminalJobsOlderThan).toHaveBeenCalledWith(expect.any(Date));
  });
});

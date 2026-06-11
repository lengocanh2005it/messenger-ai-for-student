import { StudyReminderCleanupService } from './study-reminder-cleanup.service';
import { StudyReminderJobRepository } from './study-reminder-job.repository';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';

describe('StudyReminderCleanupService', () => {
  const jobRepository = {
    deleteSentJobs: jest.fn(),
    deleteTerminalJobsOlderThan: jest.fn(),
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
    jest.spyOn(jobRepository, 'deleteSentJobs').mockResolvedValue(4);

    await expect(service.purgeSentJobs()).resolves.toEqual({ deleted: 4 });
    expect(jobRepository.deleteSentJobs).toHaveBeenCalledTimes(1);
  });

  it('purges only old cancelled/failed terminal jobs at 03:00 cleanup', async () => {
    jest
      .spyOn(jobRepository, 'deleteTerminalJobsOlderThan')
      .mockResolvedValue(2);

    const result = await service.purgeExpiredJobs();

    expect(result.deleted).toBe(2);
    expect(jobRepository.deleteTerminalJobsOlderThan).toHaveBeenCalledWith(
      expect.any(Date),
    );
  });
});

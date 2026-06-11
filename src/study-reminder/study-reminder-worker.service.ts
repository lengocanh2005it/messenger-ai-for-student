import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { StudyReminderCleanupService } from './study-reminder-cleanup.service';
import { StudyReminderDispatchService } from './study-reminder-dispatch.service';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';
import { StudyReminderSyncService } from './study-reminder-sync.service';

@Injectable()
export class StudyReminderWorkerService implements OnModuleInit {
  private readonly logger = new Logger(StudyReminderWorkerService.name);

  constructor(
    private readonly studyReminderSyncService: StudyReminderSyncService,
    private readonly studyReminderDispatchService: StudyReminderDispatchService,
    private readonly studyReminderCleanupService: StudyReminderCleanupService,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit(): Promise<void> {
    this.registerEveningRolloverCron();

    try {
      await this.studyReminderSyncService.syncUpcomingSessions();
    } catch (error) {
      this.logger.error('Initial study reminder sync failed', error);
    }
  }

  private registerEveningRolloverCron(): void {
    const { eveningRolloverHour, timezone } =
      this.studyReminderScheduleService.getOutboxSettings();
    const cronExpression = `0 0 ${eveningRolloverHour} * * *`;
    const job = new CronJob(
      cronExpression,
      () => {
        void this.handleEveningRolloverCron();
      },
      null,
      false,
      timezone,
    );

    this.schedulerRegistry.addCronJob('study-reminder-evening-rollover', job);
    job.start();

    this.logger.log(
      `Registered evening rollover cron at ${eveningRolloverHour}:00 (${timezone})`,
    );
  }

  @Cron('0 */30 * * * *', {
    name: 'study-reminder-sync',
  })
  async handleSyncCron(): Promise<void> {
    await this.studyReminderSyncService.syncUpcomingSessions();
  }

  @Cron('* * * * *', {
    name: 'study-reminder-dispatch',
  })
  async handleDispatchCron(): Promise<void> {
    await this.studyReminderDispatchService.dispatchDueReminders();
  }

  @Cron('0 0 3 * * *', {
    name: 'study-reminder-cleanup',
  })
  async handleCleanupCron(): Promise<void> {
    try {
      await this.studyReminderCleanupService.purgeExpiredJobs();
    } catch (error) {
      this.logger.error('Study reminder job cleanup failed', error);
    }
  }

  async handleEveningRolloverCron(): Promise<void> {
    try {
      await this.runEveningRollover();
    } catch (error) {
      this.logger.error('Study reminder evening rollover failed', error);
    }
  }

  runSync() {
    return this.studyReminderSyncService.syncUpcomingSessions();
  }

  runDispatch() {
    return this.studyReminderDispatchService.dispatchDueReminders();
  }

  runCleanup() {
    return this.studyReminderCleanupService.purgeExpiredJobs();
  }

  async runEveningRollover(): Promise<{
    deletedSent: number;
    sync: Awaited<ReturnType<StudyReminderSyncService['syncUpcomingSessions']>>;
  }> {
    const { syncHorizonHours } =
      this.studyReminderScheduleService.getOutboxSettings();

    this.logger.log(
      `Evening rollover: purge sent jobs, then sync next ${syncHorizonHours}h horizon`,
    );

    const { deleted: deletedSent } =
      await this.studyReminderCleanupService.purgeSentJobs();
    const sync = await this.studyReminderSyncService.syncUpcomingSessions();

    this.logger.log(
      `Evening rollover done: deletedSent=${deletedSent}, upserted=${sync.upserted}, cancelled=${sync.cancelled}`,
    );

    return { deletedSent, sync };
  }

  async runSyncAndDispatch(): Promise<{
    sync: Awaited<ReturnType<StudyReminderSyncService['syncUpcomingSessions']>>;
    dispatch: Awaited<
      ReturnType<StudyReminderDispatchService['dispatchDueReminders']>
    >;
  }> {
    this.logger.log('Manual study reminder sync + dispatch');
    const sync = await this.runSync();
    const dispatch = await this.runDispatch();
    return { sync, dispatch };
  }
}

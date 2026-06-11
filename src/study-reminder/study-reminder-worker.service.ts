import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StudyReminderCleanupService } from './study-reminder-cleanup.service';
import { StudyReminderDispatchService } from './study-reminder-dispatch.service';
import { StudyReminderSyncService } from './study-reminder-sync.service';

@Injectable()
export class StudyReminderWorkerService implements OnModuleInit {
  private readonly logger = new Logger(StudyReminderWorkerService.name);

  constructor(
    private readonly studyReminderSyncService: StudyReminderSyncService,
    private readonly studyReminderDispatchService: StudyReminderDispatchService,
    private readonly studyReminderCleanupService: StudyReminderCleanupService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.studyReminderSyncService.syncUpcomingSessions();
    } catch (error) {
      this.logger.error('Initial study reminder sync failed', error);
    }
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

  runSync() {
    return this.studyReminderSyncService.syncUpcomingSessions();
  }

  runDispatch() {
    return this.studyReminderDispatchService.dispatchDueReminders();
  }

  runCleanup() {
    return this.studyReminderCleanupService.purgeExpiredJobs();
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

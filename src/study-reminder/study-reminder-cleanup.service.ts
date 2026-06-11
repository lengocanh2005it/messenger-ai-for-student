import { Injectable, Logger } from '@nestjs/common';
import { StudyReminderJobRepository } from './study-reminder-job.repository';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';

@Injectable()
export class StudyReminderCleanupService {
  private readonly logger = new Logger(StudyReminderCleanupService.name);

  constructor(
    private readonly studyReminderJobRepository: StudyReminderJobRepository,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
  ) {}

  async purgeExpiredJobs(): Promise<{ deleted: number; cutoff: string }> {
    const { jobRetentionDays } =
      this.studyReminderScheduleService.getOutboxSettings();
    const cutoff = new Date(
      Date.now() - jobRetentionDays * 24 * 60 * 60 * 1000,
    );

    const deleted =
      await this.studyReminderJobRepository.deleteTerminalJobsOlderThan(cutoff);

    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} terminal study reminder job(s) older than ${jobRetentionDays} day(s) (before ${cutoff.toISOString()})`,
      );
    }

    return { deleted, cutoff: cutoff.toISOString() };
  }
}

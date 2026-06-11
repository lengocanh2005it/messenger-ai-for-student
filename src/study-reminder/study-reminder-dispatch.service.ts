import { Injectable, Logger } from '@nestjs/common';
import { MessengerService } from '../messenger/messenger.service';
import { StudyReminderJobRepository } from './study-reminder-job.repository';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';
import { StudyReminderService } from './study-reminder.service';
import {
  buildStudyReminderMessageType,
  jobToSession,
} from './study-reminder.utils';

@Injectable()
export class StudyReminderDispatchService {
  private readonly logger = new Logger(StudyReminderDispatchService.name);

  constructor(
    private readonly studyReminderJobRepository: StudyReminderJobRepository,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
    private readonly studyReminderService: StudyReminderService,
    private readonly messengerService: MessengerService,
  ) {}

  async dispatchDueReminders(): Promise<{
    claimed: number;
    sent: number;
    cancelled: number;
    failed: number;
    retried: number;
    resetStuck: number;
    failures: Array<{ jobId: number; psid: string; error: string }>;
  }> {
    const settings = this.studyReminderScheduleService.getOutboxSettings();
    const now = new Date();
    const resetStuck =
      await this.studyReminderJobRepository.resetStuckProcessingJobs(
        new Date(now.getTime() - 10 * 60 * 1000),
      );

    const dueJobs = await this.studyReminderJobRepository.findDueJobs(
      now,
      settings.minLeadMinutes,
    );

    let claimed = 0;
    let sent = 0;
    let cancelled = 0;
    let failed = 0;
    let retried = 0;
    const failures: Array<{ jobId: number; psid: string; error: string }> = [];

    for (const dueJob of dueJobs) {
      const job = await this.studyReminderJobRepository.claimJob(dueJob.id);
      if (!job) {
        continue;
      }

      claimed += 1;

      if (
        this.studyReminderScheduleService.isSessionStarted(job.scheduledAt, now)
      ) {
        await this.studyReminderJobRepository.markCancelled(
          job.id,
          'session already started',
        );
        cancelled += 1;
        continue;
      }

      try {
        const session = jobToSession(job);
        const messageType = buildStudyReminderMessageType(session);
        await this.messengerService.sendStudySessionReminder({
          psid: job.psid,
          userId: job.userId,
          session,
          messageType,
        });
        await this.studyReminderJobRepository.markSent(job.id);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nextRetryCount = job.retryCount + 1;
        const terminal = nextRetryCount >= job.maxRetries;

        if (terminal) {
          await this.studyReminderJobRepository.markFailed({
            jobId: job.id,
            errorMessage: message,
            retryCount: nextRetryCount,
            terminal: true,
          });
          failed += 1;
        } else {
          const nextRetryAt = new Date(
            now.getTime() + settings.retryBackoffMinutes * 60 * 1000,
          );
          await this.studyReminderJobRepository.markFailed({
            jobId: job.id,
            errorMessage: message,
            retryCount: nextRetryCount,
            nextRetryAt,
            terminal: false,
          });
          retried += 1;
        }

        failures.push({
          jobId: job.id,
          psid: job.psid,
          error: message,
        });
        this.logger.error(
          `Failed to dispatch study reminder job ${job.id} for PSID ${job.psid}`,
          error,
        );
      }
    }

    if (claimed > 0 || resetStuck > 0) {
      this.logger.log(
        `Study reminder dispatch: claimed=${claimed}, sent=${sent}, cancelled=${cancelled}, retried=${retried}, failed=${failed}, resetStuck=${resetStuck}`,
      );
    }

    return {
      claimed,
      sent,
      cancelled,
      failed,
      retried,
      resetStuck,
      failures,
    };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProactiveMessenger24hSkippedError } from '../../../messenger/application/utils/proactive-send.utils';
import { MessengerService } from '../../../messenger/application/services/messenger.service';
import {
  MESSENGER_REPOSITORY,
  type MessengerRepositoryPort,
} from '../../../messenger/domain/repositories/messenger.repository.port';
import { StudentReportRetryableError } from '../../../student-report/domain/errors/wispace-api.error';
import { todayReportDate } from '../../../../shared/utils/report-date.utils';
import {
  REPORT_SEND_JOB_REPOSITORY,
  type ReportSendJobRepositoryPort,
} from '../../domain/repositories/report-send-job.repository.port';
import { ReportCronLeaderService } from './report-cron-leader.service';
import { ReportScheduleService } from './report-schedule.service';
import { ReportSendScheduleService } from './report-send-schedule.service';

@Injectable()
export class ReportSendRetryDispatchService {
  private readonly logger = new Logger(ReportSendRetryDispatchService.name);

  constructor(
    @Inject(REPORT_SEND_JOB_REPOSITORY)
    private readonly reportSendJobRepository: ReportSendJobRepositoryPort,
    @Inject(MESSENGER_REPOSITORY)
    private readonly messengerRepository: MessengerRepositoryPort,
    private readonly messengerService: MessengerService,
    private readonly reportScheduleService: ReportScheduleService,
    private readonly reportSendScheduleService: ReportSendScheduleService,
    private readonly reportCronLeaderService: ReportCronLeaderService,
  ) {}

  /** R5: poll outbox — default 15 phút (khớp REPORT_SEND_RETRY_POLL_MINUTES). */
  @Cron('*/15 * * * *', {
    name: 'report-send-retry',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleReportSendRetryCron(): Promise<void> {
    if (!this.reportCronLeaderService.shouldRunScheduledReportCron()) {
      return;
    }

    await this.dispatchDueReportRetries();
  }

  async dispatchDueReportRetries(): Promise<{
    claimed: number;
    sent: number;
    retried: number;
    expired: number;
    windowClosed: number;
    failed: number;
    resetStuck: number;
    failures: Array<{ jobId: number; psid: string; error: string }>;
  }> {
    const settings = this.reportSendScheduleService.getOutboxSettings();
    const now = new Date();
    const reportDate = todayReportDate(settings.timezone, now);

    const resetStuck =
      await this.reportSendJobRepository.resetStuckProcessingJobs(
        new Date(now.getTime() - 10 * 60 * 1000),
      );

    const dueJobs = await this.reportSendJobRepository.findDueJobs(now);
    let claimed = 0;
    let sent = 0;
    let retried = 0;
    let expired = 0;
    let windowClosed = 0;
    let failed = 0;
    const failures: Array<{ jobId: number; psid: string; error: string }> = [];

    for (const job of dueJobs) {
      const daysUntilExam = this.reportScheduleService.calculateDaysUntilExam(
        job.examDate,
        now,
      );

      if (daysUntilExam < 0) {
        await this.reportSendJobRepository.markFailed({
          jobId: job.id,
          errorMessage: 'Exam date passed without successful report (R5)',
          retryCount: job.maxRetries,
          terminal: true,
        });
        expired += 1;
        this.logger.warn(
          `Report send job expired jobId=${job.id} psid=${job.psid} examDate=${job.examDate}`,
        );
        continue;
      }

      const claimedJob = await this.reportSendJobRepository.claimJob(job.id);
      if (!claimedJob) {
        continue;
      }

      claimed += 1;

      const mapping = await this.messengerRepository.findActiveMappingByPsid(
        claimedJob.psid,
      );

      if (!mapping?.psid) {
        await this.reportSendJobRepository.markFailed({
          jobId: claimedJob.id,
          errorMessage: 'Active mapping not found',
          retryCount: claimedJob.maxRetries,
          terminal: true,
        });
        failed += 1;
        continue;
      }

      const alreadySentToday =
        await this.messengerRepository.hasSentScheduledReportToday(
          mapping.psid,
        );
      if (alreadySentToday) {
        await this.reportSendJobRepository.markSent(claimedJob.id);
        sent += 1;
        continue;
      }

      const claimAcquired =
        await this.messengerRepository.tryClaimScheduledReport({
          psid: mapping.psid,
          userId: mapping.userId,
          reportDate,
        });

      if (!claimAcquired) {
        const nextRetryAt = new Date(
          now.getTime() + settings.retryBackoffMinutes * 60 * 1000,
        );
        await this.reportSendJobRepository.markFailed({
          jobId: claimedJob.id,
          errorMessage: 'Report claim exists for today (R4)',
          retryCount: claimedJob.retryCount,
          nextRetryAt,
          terminal: false,
        });
        retried += 1;
        continue;
      }

      try {
        const result =
          await this.messengerService.sendScheduledReportForMapping(mapping);

        if (result) {
          await this.messengerRepository.markScheduledReportClaimSent({
            psid: mapping.psid,
            reportDate,
          });
          await this.reportSendJobRepository.markSent(claimedJob.id);
          sent += 1;
        } else {
          await this.messengerRepository.releaseScheduledReportClaim({
            psid: mapping.psid,
            reportDate,
          });
          await this.reportSendJobRepository.markFailed({
            jobId: claimedJob.id,
            errorMessage: 'Messenger 24h window closed',
            retryCount: claimedJob.maxRetries,
            terminal: true,
          });
          windowClosed += 1;
        }
      } catch (error) {
        await this.messengerRepository.releaseScheduledReportClaim({
          psid: mapping.psid,
          reportDate,
        });

        if (error instanceof StudentReportRetryableError) {
          const nextRetryCount = claimedJob.retryCount + 1;
          const terminal = nextRetryCount >= claimedJob.maxRetries;
          const nextRetryAt = new Date(
            now.getTime() + settings.retryBackoffMinutes * 60 * 1000,
          );

          await this.reportSendJobRepository.markFailed({
            jobId: claimedJob.id,
            errorMessage: error.message,
            retryCount: nextRetryCount,
            nextRetryAt: terminal ? undefined : nextRetryAt,
            terminal,
          });

          if (terminal) {
            failed += 1;
            failures.push({
              jobId: claimedJob.id,
              psid: claimedJob.psid,
              error: error.message,
            });
          } else {
            retried += 1;
          }

          this.logger.warn(
            `Report send retry Wispace 5xx jobId=${claimedJob.id} psid=${claimedJob.psid} retry=${nextRetryCount}/${claimedJob.maxRetries}`,
          );
          continue;
        }

        if (error instanceof ProactiveMessenger24hSkippedError) {
          await this.reportSendJobRepository.markFailed({
            jobId: claimedJob.id,
            errorMessage: 'Messenger 24h window closed',
            retryCount: claimedJob.maxRetries,
            terminal: true,
          });
          windowClosed += 1;
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        await this.reportSendJobRepository.markFailed({
          jobId: claimedJob.id,
          errorMessage: message,
          retryCount: claimedJob.maxRetries,
          terminal: true,
        });
        failed += 1;
        failures.push({
          jobId: claimedJob.id,
          psid: claimedJob.psid,
          error: message,
        });
        this.logger.error(
          `Report send retry failed jobId=${claimedJob.id} psid=${claimedJob.psid}`,
          error,
        );
      }
    }

    if (claimed > 0 || resetStuck > 0) {
      this.logger.log(
        `Report send retry dispatch: claimed=${claimed}, sent=${sent}, retried=${retried}, expired=${expired}, windowClosed=${windowClosed}, failed=${failed}, resetStuck=${resetStuck}`,
      );
    }

    return {
      claimed,
      sent,
      retried,
      expired,
      windowClosed,
      failed,
      resetStuck,
      failures,
    };
  }
}

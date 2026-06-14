import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ProactiveMessenger24hSkippedError } from '../../../messenger/application/utils/proactive-send.utils';
import { MessengerService } from '../../../messenger/application/services/messenger.service';
import {
  MESSENGER_REPOSITORY,
  type MessengerRepositoryPort,
} from '../../../messenger/domain/repositories/messenger.repository.port';
import { todayReportDate } from '../../../../shared/utils/report-date.utils';
import { StudentReportRetryableError } from '../../../student-report/domain/errors/wispace-api.error';
import type {
  SendScheduledReportsOptions,
  SendScheduledReportsResult,
} from '../../domain/entities/send-scheduled-reports.types';
import {
  REPORT_SEND_JOB_REPOSITORY,
  type ReportSendJobRepositoryPort,
} from '../../domain/repositories/report-send-job.repository.port';
import { ReportCronLeaderService } from './report-cron-leader.service';
import { ReportCronLockService } from './report-cron-lock.service';
import { ReportScheduleService } from './report-schedule.service';
import { ReportSendScheduleService } from './report-send-schedule.service';

@Injectable()
export class ReportCronService {
  private readonly logger = new Logger(ReportCronService.name);

  constructor(
    @Inject(MESSENGER_REPOSITORY)
    private readonly messengerRepository: MessengerRepositoryPort,
    private readonly messengerService: MessengerService,
    private readonly reportScheduleService: ReportScheduleService,
    private readonly reportCronLeaderService: ReportCronLeaderService,
    private readonly reportCronLockService: ReportCronLockService,
    private readonly configService: ConfigService,
    @Inject(REPORT_SEND_JOB_REPOSITORY)
    private readonly reportSendJobRepository: ReportSendJobRepositoryPort,
    private readonly reportSendScheduleService: ReportSendScheduleService,
  ) {}

  @Cron('0 8 * * *', {
    name: 'exam-reminder-report',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleExamReminderCron(): Promise<void> {
    if (!this.reportCronLeaderService.shouldRunScheduledReportCron()) {
      return;
    }

    const acquired = await this.reportCronLockService.tryAcquireDailyLock();
    if (!acquired) {
      return;
    }

    try {
      await this.sendScheduledReports();
    } finally {
      await this.reportCronLockService.releaseDailyLock();
    }
  }

  async sendScheduledReports(
    options?: SendScheduledReportsOptions,
  ): Promise<SendScheduledReportsResult> {
    const forceSend = options?.forceSend === true;
    const allowDuplicate = options?.allowDuplicate === true;
    const skipAlreadySentToday = !allowDuplicate;
    const psidFilter = options?.psid?.trim();

    const schedule = this.reportScheduleService.getExamReminderWindow();
    const reportDate = todayReportDate(
      this.configService.get<string>('CHAT_USAGE_TIMEZONE') ??
        'Asia/Ho_Chi_Minh',
    );

    if (forceSend) {
      const scope = psidFilter ? `psid=${psidFilter}` : 'all subscribed';
      this.logger.log(
        `Ops send-reports (${scope}): bypass exam window ${schedule.minDays}-${schedule.maxDays} days` +
          (allowDuplicate
            ? ', allowDuplicate=true'
            : ', skip already sent today'),
      );
    }

    await this.messengerRepository.cleanupActiveDuplicateMappings();

    let mappings =
      await this.messengerRepository.findActiveSubscribedMappings();

    if (psidFilter) {
      mappings = mappings.filter((m) => m.psid === psidFilter);
      if (mappings.length === 0) {
        throw new BadRequestException(
          `No active subscribed mapping for psid=${psidFilter}`,
        );
      }
    }

    const failures: SendScheduledReportsResult['failures'] = [];
    let sent = 0;
    let skipped = 0;
    let deferred = 0;
    let windowClosed = 0;
    let claimSkipped = 0;
    let retryQueued = 0;

    for (const mapping of mappings) {
      if (!mapping.psid) {
        skipped += 1;
        this.logger.log(`Skip mapping ${mapping.id}: missing PSID`);
        continue;
      }

      const examDateForOutbox = await this.resolveExamDate(mapping.psid);

      if (!forceSend) {
        const userSchedule =
          await this.reportScheduleService.shouldSendReportToday(mapping.psid);

        if (!userSchedule.shouldSend) {
          skipped += 1;
          this.logger.log(
            `Skip PSID ${mapping.psid}: examDate=${userSchedule.examDate}, daysUntilExam=${userSchedule.daysUntilExam}, window=${userSchedule.minDays}-${userSchedule.maxDays}`,
          );
          continue;
        }
      }

      if (skipAlreadySentToday) {
        const alreadySentToday =
          await this.messengerRepository.hasSentScheduledReportToday(
            mapping.psid,
          );
        if (alreadySentToday) {
          skipped += 1;
          this.logger.log(
            `Skip PSID ${mapping.psid}: scheduled report already sent today`,
          );
          if (examDateForOutbox) {
            await this.reportSendJobRepository.markSentByPsidExamDate(
              mapping.psid,
              examDateForOutbox,
            );
          }
          continue;
        }
      }

      let claimedForSend = false;
      if (skipAlreadySentToday) {
        const claimed = await this.messengerRepository.tryClaimScheduledReport({
          psid: mapping.psid,
          userId: mapping.userId,
          reportDate,
        });
        if (!claimed) {
          claimSkipped += 1;
          this.logger.log(
            `Skip PSID ${mapping.psid}: report claim exists for ${reportDate} (R4)`,
          );
          continue;
        }
        claimedForSend = true;
      }

      try {
        const result =
          await this.messengerService.sendScheduledReportForMapping(mapping);
        if (result) {
          sent += 1;
          if (claimedForSend) {
            await this.messengerRepository.markScheduledReportClaimSent({
              psid: mapping.psid,
              reportDate,
            });
          }
          if (examDateForOutbox) {
            await this.reportSendJobRepository.markSentByPsidExamDate(
              mapping.psid,
              examDateForOutbox,
            );
          }
        } else {
          windowClosed += 1;
          if (claimedForSend) {
            await this.messengerRepository.releaseScheduledReportClaim({
              psid: mapping.psid,
              reportDate,
            });
          }
        }
      } catch (error) {
        if (claimedForSend) {
          if (
            error instanceof StudentReportRetryableError ||
            error instanceof ProactiveMessenger24hSkippedError
          ) {
            await this.messengerRepository.releaseScheduledReportClaim({
              psid: mapping.psid,
              reportDate,
            });
          }
        }

        if (error instanceof StudentReportRetryableError) {
          deferred += 1;
          if (examDateForOutbox) {
            const settings = this.reportSendScheduleService.getOutboxSettings();
            const nextRetryAt = new Date(
              Date.now() + settings.retryBackoffMinutes * 60 * 1000,
            );
            const job =
              await this.reportSendJobRepository.recordRetryableFailure({
                psid: mapping.psid,
                userId: mapping.userId,
                examDate: examDateForOutbox,
                firstAttemptDate: reportDate,
                maxRetries: settings.maxRetries,
                nextRetryAt,
                errorMessage: error.message,
              });
            if (job.nextRetryAt) {
              retryQueued += 1;
            }
          }
          this.logger.warn(
            `Deferred scheduled report for PSID ${mapping.psid} (Wispace API retryable, R3/R5)`,
          );
          continue;
        }

        if (error instanceof ProactiveMessenger24hSkippedError) {
          windowClosed += 1;
          this.logger.warn(
            `Skipped scheduled report for PSID ${mapping.psid} (Messenger 24h window, L2)`,
          );
          continue;
        }

        const message = error instanceof Error ? error.message : String(error);
        failures.push({
          token: mapping.notificationMessagesToken,
          error: message,
        });
        this.logger.error(
          `Failed to send report for token ${mapping.notificationMessagesToken}`,
          error,
        );
      }
    }

    return {
      total: mappings.length,
      sent,
      skipped,
      deferred,
      windowClosed,
      claimSkipped,
      retryQueued,
      failed: failures.length,
      schedule,
      failures,
    };
  }

  private async resolveExamDate(psid: string): Promise<string | undefined> {
    try {
      const userSchedule =
        await this.reportScheduleService.shouldSendReportToday(psid);
      return userSchedule.examDate;
    } catch {
      return undefined;
    }
  }
}

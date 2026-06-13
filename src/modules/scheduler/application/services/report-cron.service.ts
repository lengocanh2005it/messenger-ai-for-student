import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ProactiveMessenger24hSkippedError } from '../../../messenger/application/utils/proactive-send.utils';
import { MessengerService } from '../../../messenger/application/services/messenger.service';
import {
  MESSENGER_REPOSITORY,
  type MessengerRepositoryPort,
} from '../../../messenger/domain/repositories/messenger.repository.port';
import { StudentReportRetryableError } from '../../../student-report/domain/errors/wispace-api.error';
import { todayReportDate } from '../../../../shared/utils/report-date.utils';
import { ReportCronLeaderService } from './report-cron-leader.service';
import { ReportCronLockService } from './report-cron-lock.service';
import { ReportScheduleService } from './report-schedule.service';

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

  async sendScheduledReports(options?: { forceSend?: boolean }): Promise<{
    total: number;
    sent: number;
    skipped: number;
    deferred: number;
    windowClosed: number;
    claimSkipped: number;
    failed: number;
    schedule: {
      minDays: number;
      maxDays: number;
    };
    failures: Array<{ token: string; error: string }>;
  }> {
    const forceSend = options?.forceSend === true;
    const schedule = this.reportScheduleService.getExamReminderWindow();
    const reportDate = todayReportDate(
      this.configService.get<string>('CHAT_USAGE_TIMEZONE') ??
        'Asia/Ho_Chi_Minh',
    );

    if (forceSend) {
      this.logger.log(
        `Force send-reports: bypassing per-user exam date window (${schedule.minDays}-${schedule.maxDays} days)`,
      );
    }

    await this.messengerRepository.cleanupActiveDuplicateMappings();

    const mappings =
      await this.messengerRepository.findActiveSubscribedMappings();

    const failures: Array<{ token: string; error: string }> = [];
    let sent = 0;
    let skipped = 0;
    let deferred = 0;
    let windowClosed = 0;
    let claimSkipped = 0;

    for (const mapping of mappings) {
      if (!mapping.psid) {
        skipped += 1;
        this.logger.log(`Skip mapping ${mapping.id}: missing PSID`);
        continue;
      }

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

        const alreadySentToday =
          await this.messengerRepository.hasSentScheduledReportToday(
            mapping.psid,
          );
        if (alreadySentToday) {
          skipped += 1;
          this.logger.log(
            `Skip PSID ${mapping.psid}: scheduled report already sent today`,
          );
          continue;
        }

        const claimed =
          await this.messengerRepository.tryClaimScheduledReport({
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
      }

      try {
        const result =
          await this.messengerService.sendScheduledReportForMapping(mapping);
        if (result) {
          sent += 1;
          if (!forceSend) {
            await this.messengerRepository.markScheduledReportClaimSent({
              psid: mapping.psid,
              reportDate,
            });
          }
        } else {
          windowClosed += 1;
          if (!forceSend) {
            await this.messengerRepository.releaseScheduledReportClaim({
              psid: mapping.psid,
              reportDate,
            });
          }
        }
      } catch (error) {
        if (!forceSend) {
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
          this.logger.warn(
            `Deferred scheduled report for PSID ${mapping.psid} (Wispace API retryable, R3)`,
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
      failed: failures.length,
      schedule,
      failures,
    };
  }
}

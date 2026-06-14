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
import type { UserMessengerMapping } from '../../../messenger/domain/entities/messenger.types';

interface MappingReportResult {
  sent: number;
  skipped: number;
  deferred: number;
  windowClosed: number;
  claimSkipped: number;
  retryQueued: number;
  failures: Array<{ token: string; error: string }>;
}

const ZERO: MappingReportResult = {
  sent: 0,
  skipped: 0,
  deferred: 0,
  windowClosed: 0,
  claimSkipped: 0,
  retryQueued: 0,
  failures: [],
};

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

    const concurrency = this.readConcurrency();
    const results = await this.runWithConcurrency(
      mappings,
      concurrency,
      (mapping) =>
        this.processMappingForReport(mapping, {
          forceSend,
          skipAlreadySentToday,
          reportDate,
        }),
    );

    let sent = 0;
    let skipped = 0;
    let deferred = 0;
    let windowClosed = 0;
    let claimSkipped = 0;
    let retryQueued = 0;
    const failures: SendScheduledReportsResult['failures'] = [];

    for (const r of results) {
      sent += r.sent;
      skipped += r.skipped;
      deferred += r.deferred;
      windowClosed += r.windowClosed;
      claimSkipped += r.claimSkipped;
      retryQueued += r.retryQueued;
      failures.push(...r.failures);
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

  private async processMappingForReport(
    mapping: UserMessengerMapping,
    opts: {
      forceSend: boolean;
      skipAlreadySentToday: boolean;
      reportDate: string;
    },
  ): Promise<MappingReportResult> {
    const { forceSend, skipAlreadySentToday, reportDate } = opts;

    if (!mapping.psid) {
      this.logger.log(`Skip mapping ${mapping.id}: missing PSID`);
      return { ...ZERO, skipped: 1 };
    }

    // Single Wispace API call — supplies both shouldSend and examDate
    let examDateForOutbox: string | undefined;
    try {
      const userSchedule =
        await this.reportScheduleService.shouldSendReportToday(mapping.psid);
      examDateForOutbox = userSchedule.examDate;

      if (!forceSend && !userSchedule.shouldSend) {
        this.logger.log(
          `Skip PSID ${mapping.psid}: examDate=${userSchedule.examDate}, daysUntilExam=${userSchedule.daysUntilExam}, window=${userSchedule.minDays}-${userSchedule.maxDays}`,
        );
        return { ...ZERO, skipped: 1 };
      }
    } catch (err) {
      if (!forceSend) {
        this.logger.warn(
          `Skip PSID ${mapping.psid}: could not resolve exam schedule`,
          err,
        );
        return { ...ZERO, skipped: 1 };
      }
      // forceSend: continue without examDate
    }

    if (skipAlreadySentToday) {
      const alreadySentToday =
        await this.messengerRepository.hasSentScheduledReportToday(
          mapping.psid,
        );
      if (alreadySentToday) {
        this.logger.log(
          `Skip PSID ${mapping.psid}: scheduled report already sent today`,
        );
        if (examDateForOutbox) {
          await this.reportSendJobRepository.markSentByPsidExamDate(
            mapping.psid,
            examDateForOutbox,
          );
        }
        return { ...ZERO, skipped: 1 };
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
        this.logger.log(
          `Skip PSID ${mapping.psid}: report claim exists for ${reportDate} (R4)`,
        );
        return { ...ZERO, claimSkipped: 1 };
      }
      claimedForSend = true;
    }

    try {
      const result =
        await this.messengerService.sendScheduledReportForMapping(mapping);

      if (result) {
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
        return { ...ZERO, sent: 1 };
      }

      if (claimedForSend) {
        await this.messengerRepository.releaseScheduledReportClaim({
          psid: mapping.psid,
          reportDate,
        });
      }
      return { ...ZERO, windowClosed: 1 };
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
        let retryQueued = 0;
        if (examDateForOutbox) {
          const settings = this.reportSendScheduleService.getOutboxSettings();
          const nextRetryAt = new Date(
            Date.now() + settings.retryBackoffMinutes * 60 * 1000,
          );
          const job = await this.reportSendJobRepository.recordRetryableFailure(
            {
              psid: mapping.psid,
              userId: mapping.userId,
              examDate: examDateForOutbox,
              firstAttemptDate: reportDate,
              maxRetries: settings.maxRetries,
              nextRetryAt,
              errorMessage: error.message,
            },
          );
          if (job.nextRetryAt) retryQueued = 1;
        }
        this.logger.warn(
          `Deferred scheduled report for PSID ${mapping.psid} (Wispace API retryable, R3/R5)`,
        );
        return { ...ZERO, deferred: 1, retryQueued };
      }

      if (error instanceof ProactiveMessenger24hSkippedError) {
        this.logger.warn(
          `Skipped scheduled report for PSID ${mapping.psid} (Messenger 24h window, L2)`,
        );
        return { ...ZERO, windowClosed: 1 };
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send report for token ${mapping.notificationMessagesToken}`,
        error,
      );
      return {
        ...ZERO,
        failures: [
          { token: mapping.notificationMessagesToken, error: message },
        ],
      };
    }
  }

  private async runWithConcurrency(
    mappings: UserMessengerMapping[],
    concurrency: number,
    fn: (m: UserMessengerMapping) => Promise<MappingReportResult>,
  ): Promise<MappingReportResult[]> {
    const results: MappingReportResult[] = [];
    for (let i = 0; i < mappings.length; i += concurrency) {
      const batch = mappings.slice(i, i + concurrency);
      const settled = await Promise.allSettled(batch.map((m) => fn(m)));
      for (const r of settled) {
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          this.logger.error(
            'Unexpected error in processMappingForReport',
            r.reason,
          );
        }
      }
    }
    return results;
  }

  private readConcurrency(): number {
    const raw = this.configService
      .get<string>('REPORT_SEND_CONCURRENCY')
      ?.trim();
    if (!raw) return 5;
    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { POC_CADENCE } from '../config/poc.constants';
import { MessengerRepository } from '../messenger/messenger.repository';
import { MessengerService } from '../messenger/messenger.service';
import { ReportScheduleService } from './report-schedule.service';

@Injectable()
export class ReportCronService {
  private readonly logger = new Logger(ReportCronService.name);

  constructor(
    private readonly messengerRepository: MessengerRepository,
    private readonly messengerService: MessengerService,
    private readonly reportScheduleService: ReportScheduleService,
  ) {}

  @Cron('0 8 * * *', {
    name: 'exam-reminder-report',
  })
  async handleExamReminderCron(): Promise<void> {
    await this.sendScheduledReports();
  }

  async sendScheduledReports(options?: {
    forceSend?: boolean;
  }): Promise<{
    total: number;
    sent: number;
    skipped: number;
    failed: number;
    schedule: {
      minDays: number;
      maxDays: number;
    };
    failures: Array<{ token: string; error: string }>;
  }> {
    const forceSend = options?.forceSend === true;
    const schedule = this.reportScheduleService.getExamReminderWindow();

    if (forceSend) {
      this.logger.log(
        `Force send-reports: bypassing per-user exam date window (${schedule.minDays}-${schedule.maxDays} days)`,
      );
    }

    await this.messengerRepository.cleanupActiveDuplicateMappings();

    const mappings =
      await this.messengerRepository.findActiveMappingsForCadence(POC_CADENCE);

    const failures: Array<{ token: string; error: string }> = [];
    let sent = 0;
    let skipped = 0;

    for (const mapping of mappings) {
      if (!mapping.psid) {
        skipped += 1;
        this.logger.log(`Skip mapping ${mapping.id}: missing PSID`);
        continue;
      }

      if (!forceSend) {
        const userSchedule = await this.reportScheduleService.shouldSendReportToday(
          mapping.psid,
        );

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
      }

      try {
        await this.messengerService.sendScheduledReportForMapping(mapping);
        sent += 1;
      } catch (error) {
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
      failed: failures.length,
      schedule,
      failures,
    };
  }
}

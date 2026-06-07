import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MessengerRepository } from '../messenger/messenger.repository';
import { MessengerService } from '../messenger/messenger.service';
import { StudentReportService } from '../student-report/student-report.service';
import { NotificationCadence } from '../messenger/types';

@Injectable()
export class ReportCronService {
  private readonly logger = new Logger(ReportCronService.name);

  constructor(
    private readonly messengerRepository: MessengerRepository,
    private readonly messengerService: MessengerService,
    private readonly studentReportService: StudentReportService,
  ) {}

  @Cron('0 8 * * *', {
    name: 'recurring-student-report',
  })
  async handleDailyReportCron(): Promise<void> {
    await this.sendScheduledReports();
  }

  async sendScheduledReports(): Promise<{
    total: number;
    sent: number;
    failed: number;
    failures: Array<{ token: string; error: string }>;
  }> {
    const cadences = this.getCadencesDueToday();
    const mappings = (
      await Promise.all(
        cadences.map((cadence) =>
          this.messengerRepository.findActiveMappingsForCadence(cadence),
        ),
      )
    ).flat();

    const failures: Array<{ token: string; error: string }> = [];
    let sent = 0;

    for (const mapping of mappings) {
      try {
        const userId = mapping.userId ?? 0;
        const report = await this.studentReportService.generateReport(userId);
        await this.messengerService.sendTextViaToken({
          notificationMessagesToken: mapping.notificationMessagesToken,
          userId: mapping.userId,
          psid: mapping.psid,
          text: report,
          messageType: 'SCHEDULED_LEARNING_REPORT',
        });
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
      failed: failures.length,
      failures,
    };
  }

  private getCadencesDueToday(): NotificationCadence[] {
    const now = new Date();
    const cadences: NotificationCadence[] = ['DAILY'];

    if (now.getDay() === 1) {
      cadences.push('WEEKLY');
    }

    if (now.getDate() === 1) {
      cadences.push('MONTHLY');
    }

    return cadences;
  }
}

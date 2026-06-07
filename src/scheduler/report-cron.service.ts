import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { POC_CADENCE } from '../config/poc.constants';
import { MessengerRepository } from '../messenger/messenger.repository';
import { MessengerService } from '../messenger/messenger.service';

@Injectable()
export class ReportCronService {
  private readonly logger = new Logger(ReportCronService.name);

  constructor(
    private readonly messengerRepository: MessengerRepository,
    private readonly messengerService: MessengerService,
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
    const mappings =
      await this.messengerRepository.findActiveMappingsForCadence(POC_CADENCE);

    const failures: Array<{ token: string; error: string }> = [];
    let sent = 0;

    for (const mapping of mappings) {
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
      failed: failures.length,
      failures,
    };
  }
}

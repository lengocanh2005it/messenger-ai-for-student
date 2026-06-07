import { Controller, HttpCode, Post } from '@nestjs/common';
import { ReportCronService } from './report-cron.service';

@Controller('messenger')
export class SchedulerController {
  constructor(private readonly reportCronService: ReportCronService) {}

  @Post('send-reports')
  @HttpCode(200)
  sendReports() {
    return this.reportCronService.sendScheduledReports({ forceSend: true });
  }
}

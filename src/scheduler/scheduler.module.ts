import { Module } from '@nestjs/common';
import { MessengerModule } from '../messenger/messenger.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { ReportCronService } from './report-cron.service';
import { SchedulerController } from './scheduler.controller';

@Module({
  imports: [MessengerModule, StudentReportModule],
  controllers: [SchedulerController],
  providers: [ReportCronService],
})
export class SchedulerModule {}

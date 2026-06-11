import { Module } from '@nestjs/common';
import { MessengerModule } from '../messenger/messenger.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { ReportCronService } from './report-cron.service';
import { ReportScheduleService } from './report-schedule.service';
import { SchedulerController } from './scheduler.controller';

@Module({
  imports: [MessengerModule, StudentReportModule, StudyReminderModule],
  controllers: [SchedulerController],
  providers: [ReportScheduleService, ReportCronService],
})
export class SchedulerModule {}

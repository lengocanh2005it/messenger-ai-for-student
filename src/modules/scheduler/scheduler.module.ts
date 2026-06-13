import { Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { ChatRateLimitModule } from '../chat-rate-limit/chat-rate-limit.module';
import { MessengerModule } from '../messenger/messenger.module';
import { MessengerOutboundModule } from '../messenger/messenger-outbound.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { OpsHealthCronService } from './application/services/ops-health-cron.service';
import { OpsHealthService } from './application/services/ops-health.service';
import { ReportCronService } from './application/services/report-cron.service';
import { ReportScheduleService } from './application/services/report-schedule.service';
import { SchedulerController } from './presentation/controllers/scheduler.controller';

@Module({
  imports: [
    CommonModule,
    ChatRateLimitModule,
    MessengerOutboundModule,
    MessengerModule,
    StudentReportModule,
    StudyReminderModule,
  ],
  controllers: [SchedulerController],
  providers: [
    ReportScheduleService,
    ReportCronService,
    OpsHealthService,
    OpsHealthCronService,
  ],
})
export class SchedulerModule {}

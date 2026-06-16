import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportSendJobEntity } from '../../infrastructure/database/entities/report-send-job.entity';
import { CommonModule } from '../../shared/common/common.module';
import { ChatRateLimitModule } from '../chat-rate-limit/chat-rate-limit.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MessengerModule } from '../messenger/messenger.module';
import { MessengerOutboundModule } from '../messenger/messenger-outbound.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { CiDeployService } from './application/services/ci-deploy.service';
import { DopplerRuntimeSyncService } from './application/services/doppler-runtime-sync.service';
import { OpsHealthCronService } from './application/services/ops-health-cron.service';
import { OpsHealthService } from './application/services/ops-health.service';
import { ReportCronLeaderService } from './application/services/report-cron-leader.service';
import { ReportCronLockService } from './application/services/report-cron-lock.service';
import { ReportCronService } from './application/services/report-cron.service';
import { ReportSendRetryDispatchService } from './application/services/report-send-retry-dispatch.service';
import { ReportSendScheduleService } from './application/services/report-send-schedule.service';
import { ReportScheduleService } from './application/services/report-schedule.service';
import { REPORT_SEND_JOB_REPOSITORY } from './domain/repositories/report-send-job.repository.port';
import { ReportSendJobRepository } from './infrastructure/persistence/report-send-job.repository';
import { SchedulerController } from './presentation/controllers/scheduler.controller';

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    TypeOrmModule.forFeature([ReportSendJobEntity]),
    ChatRateLimitModule,
    MessengerOutboundModule,
    MessengerModule,
    StudentReportModule,
    StudyReminderModule,
  ],
  controllers: [SchedulerController],
  providers: [
    ReportScheduleService,
    ReportCronLeaderService,
    ReportCronLockService,
    ReportCronService,
    ReportSendScheduleService,
    ReportSendRetryDispatchService,
    ReportSendJobRepository,
    {
      provide: REPORT_SEND_JOB_REPOSITORY,
      useExisting: ReportSendJobRepository,
    },
    OpsHealthService,
    OpsHealthCronService,
    DopplerRuntimeSyncService,
    CiDeployService,
  ],
})
export class SchedulerModule {}

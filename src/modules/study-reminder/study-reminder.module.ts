import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyReminderJobEntity } from '../../infrastructure/database/entities/study-reminder-job.entity';
import { UserEntity } from '../../infrastructure/database/entities/user.entity';
import { MessengerOutboundModule } from '../messenger/messenger-outbound.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyCalendarCommandService } from './application/services/study-calendar-command.service';
import { StudyReminderCleanupService } from './application/services/study-reminder-cleanup.service';
import { StudyReminderDispatchService } from './application/services/study-reminder-dispatch.service';
import { StudyReminderScheduleService } from './application/services/study-reminder-schedule.service';
import { StudyReminderSyncService } from './application/services/study-reminder-sync.service';
import { StudyReminderWorkerService } from './application/services/study-reminder-worker.service';
import { StudyReminderService } from './application/services/study-reminder.service';
import { StudySessionSourceService } from './application/services/study-session-source.service';
import { UserDisplayNameService } from './application/services/user-display-name.service';
import { UserCalendarScheduleService } from './infrastructure/wispace/user-calendar-schedule.service';
import { UserCalendarApiService } from './infrastructure/wispace/user-calendar-api.service';
import { STUDY_REMINDER_JOB_REPOSITORY } from './domain/repositories/study-reminder-job.repository.port';
import { StudyReminderJobRepository } from './infrastructure/persistence/study-reminder-job.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudyReminderJobEntity, UserEntity]),
    MessengerOutboundModule,
    StudentReportModule,
  ],
  providers: [
    UserCalendarApiService,
    UserCalendarScheduleService,
    StudyCalendarCommandService,
    StudySessionSourceService,
    StudyReminderScheduleService,
    StudyReminderService,
    UserDisplayNameService,
    StudyReminderJobRepository,
    {
      provide: STUDY_REMINDER_JOB_REPOSITORY,
      useExisting: StudyReminderJobRepository,
    },
    StudyReminderSyncService,
    StudyReminderDispatchService,
    StudyReminderCleanupService,
    StudyReminderWorkerService,
  ],
  exports: [
    StudyReminderService,
    StudyReminderScheduleService,
    StudyReminderWorkerService,
    StudyReminderSyncService,
    StudyReminderDispatchService,
    StudySessionSourceService,
    StudyCalendarCommandService,
    UserCalendarApiService,
    UserDisplayNameService,
  ],
})
export class StudyReminderModule {}

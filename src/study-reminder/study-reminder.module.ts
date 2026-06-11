import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyReminderJobEntity } from '../database/entities/study-reminder-job.entity';
import { MessengerModule } from '../messenger/messenger.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderCleanupService } from './study-reminder-cleanup.service';
import { StudyReminderDispatchService } from './study-reminder-dispatch.service';
import { StudyReminderJobRepository } from './study-reminder-job.repository';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';
import { StudyReminderSyncService } from './study-reminder-sync.service';
import { StudyReminderWorkerService } from './study-reminder-worker.service';
import { StudyReminderService } from './study-reminder.service';
import { StudySessionSourceService } from './study-session-source.service';
import { UserCalendarApiService } from './user-calendar-api.service';
import { UserCalendarScheduleService } from './user-calendar-schedule.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudyReminderJobEntity]),
    StudentReportModule,
    forwardRef(() => MessengerModule),
  ],
  providers: [
    UserCalendarApiService,
    UserCalendarScheduleService,
    StudySessionSourceService,
    StudyReminderScheduleService,
    StudyReminderService,
    StudyReminderJobRepository,
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
    UserCalendarApiService,
  ],
})
export class StudyReminderModule {}

import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InternalApiKeyGuard } from '../common/guards/internal-api-key.guard';
import { StudyReminderSyncService } from '../study-reminder/study-reminder-sync.service';
import { StudyReminderWorkerService } from '../study-reminder/study-reminder-worker.service';
import { ReportCronService } from './report-cron.service';

interface SyncStudyCalendarBody {
  userId: number;
}

@Controller('messenger')
@UseGuards(InternalApiKeyGuard)
export class SchedulerController {
  constructor(
    private readonly reportCronService: ReportCronService,
    private readonly studyReminderSyncService: StudyReminderSyncService,
    private readonly studyReminderWorkerService: StudyReminderWorkerService,
  ) {}

  @Post('send-reports')
  @HttpCode(200)
  sendReports() {
    return this.reportCronService.sendScheduledReports({ forceSend: true });
  }

  @Post('study-calendar/sync')
  @HttpCode(200)
  syncStudyCalendarAfterChange(@Body() body: SyncStudyCalendarBody) {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new BadRequestException('userId must be a positive number');
    }

    return this.studyReminderSyncService.syncUpcomingSessions({ userId });
  }

  @Post('sync-study-reminders')
  @HttpCode(200)
  syncStudyReminders() {
    return this.studyReminderSyncService.syncUpcomingSessions();
  }

  @Post('send-study-reminders')
  @HttpCode(200)
  sendStudyReminders() {
    return this.studyReminderWorkerService.runSyncAndDispatch();
  }

  @Post('study-reminder/evening-rollover')
  @HttpCode(200)
  runStudyReminderEveningRollover() {
    return this.studyReminderWorkerService.runEveningRollover();
  }
}

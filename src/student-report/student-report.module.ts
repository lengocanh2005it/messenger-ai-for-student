import { Module } from '@nestjs/common';
import { TaskScoreAverageApiService } from './task-score-average-api.service';
import { UserGoalsApiService } from './user-goals-api.service';
import { StudentCapacityService } from './student-capacity.service';
import { StudentReportService } from './student-report.service';

@Module({
  providers: [
    UserGoalsApiService,
    TaskScoreAverageApiService,
    StudentCapacityService,
    StudentReportService,
  ],
  exports: [StudentReportService, StudentCapacityService, UserGoalsApiService],
})
export class StudentReportModule {}

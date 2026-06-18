import { Module } from '@nestjs/common';
import { LlmUsageModule } from '../llm-usage/llm-usage.module';
import { StudentCapacityService } from './application/services/student-capacity.service';
import { StudentReportService } from './application/services/student-report.service';
import { TaskScoreAverageApiService } from './infrastructure/wispace/task-score-average-api.service';
import { UserGoalsApiService } from './infrastructure/wispace/user-goals-api.service';

@Module({
  imports: [LlmUsageModule],
  providers: [
    UserGoalsApiService,
    TaskScoreAverageApiService,
    StudentCapacityService,
    StudentReportService,
  ],
  exports: [StudentReportService, StudentCapacityService, UserGoalsApiService],
})
export class StudentReportModule {}

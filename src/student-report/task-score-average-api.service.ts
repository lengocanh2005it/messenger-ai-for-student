import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { POC_USER_ID } from '../config/poc.constants';
import { TaskScoreAverageRecord } from './task-score-average.types';
import { StudentCapacityInput } from './student-capacity.types';
import { UserGoalsApiService } from './user-goals-api.service';

@Injectable()
export class TaskScoreAverageApiService {
  private readonly logger = new Logger(TaskScoreAverageApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userGoalsApiService: UserGoalsApiService,
  ) {}

  async getCapacityData(userId: number): Promise<StudentCapacityInput> {
    const records = await this.fetchTaskScoreAverages();
    const resolvedUserId = userId > 0 ? userId : POC_USER_ID;
    const userRecords = records.filter(
      (record) => record.userId === resolvedUserId,
    );

    if (userRecords.length === 0) {
      throw new InternalServerErrorException(
        `TaskScoreAverage API has no data for userId=${resolvedUserId}`,
      );
    }

    const goals = await this.userGoalsApiService.getUserGoals();

    return this.mapToCapacityInput(userRecords, goals);
  }

  private async fetchTaskScoreAverages(): Promise<TaskScoreAverageRecord[]> {
    const url =
      this.configService.get<string>('WISPACE_API_TASK_SCORE_URL') ??
      'https://backend.aihubproduction.com/api/TaskScoreAverage';
    const accessToken = this.configService.get<string>(
      'WISPACE_API_ACCESS_TOKEN',
    );

    if (!accessToken) {
      throw new InternalServerErrorException(
        'WISPACE_API_ACCESS_TOKEN is missing',
      );
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `TaskScoreAverage API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const data = (await response.json()) as TaskScoreAverageRecord[];
    this.logger.log(`TaskScoreAverage API returned ${data.length} record(s)`);
    return data;
  }

  private mapToCapacityInput(
    records: TaskScoreAverageRecord[],
    goals: { targetScore: number; examDate: string },
  ): StudentCapacityInput {
    const task1 = records.find((record) =>
      record.task.toLowerCase().includes('task 1'),
    );
    const task2 = records.find((record) =>
      record.task.toLowerCase().includes('task 2'),
    );

    return {
      exam_date: this.userGoalsApiService.parseExamDate(goals.examDate),
      current_date: new Date().toISOString().slice(0, 10),
      target_band: goals.targetScore,
      task1_band: this.roundBand(task1?.avgTotalScore),
      task2_band: this.roundBand(task2?.avgTotalScore),
      total_essays_task1: task1?.task1Count ?? 0,
      total_essays_task2: task2?.task2Count ?? 0,
    };
  }

  private roundBand(value?: number): number {
    if (value === undefined || Number.isNaN(value)) {
      return 0;
    }

    return Math.round(value * 10) / 10;
  }
}

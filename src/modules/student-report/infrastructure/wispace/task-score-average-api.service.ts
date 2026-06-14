import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { StudentReportNoScoreDataError } from '../../domain/errors/student-report-no-score-data.error';
import { WispaceApiError } from '../../domain/errors/wispace-api.error';
import { ConfigService } from '@nestjs/config';
import { TaskScoreAverageRecord } from '../../domain/types/task-score-average.types';
import { StudentCapacityInput } from '../../domain/types/student-capacity.types';
import { UserGoalsApiService } from './user-goals-api.service';
import { withRetry } from '../../../../shared/common/with-retry';

function isWispaceRetryable(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === 'object' &&
    'isRetryable' in error &&
    typeof (error as { isRetryable: unknown }).isRetryable === 'function'
  ) {
    return (error as { isRetryable: () => boolean }).isRetryable();
  }
  return error instanceof TypeError;
}

@Injectable()
export class TaskScoreAverageApiService {
  private readonly logger = new Logger(TaskScoreAverageApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userGoalsApiService: UserGoalsApiService,
  ) {}

  async getCapacityData(psid: string): Promise<StudentCapacityInput> {
    const records = await this.fetchTaskScoreAverages(psid);

    if (records.length === 0) {
      throw new StudentReportNoScoreDataError(psid);
    }

    const goals = await this.userGoalsApiService.getUserGoals(psid);

    return this.mapToCapacityInput(records, goals);
  }

  private async fetchTaskScoreAverages(
    psid: string,
  ): Promise<TaskScoreAverageRecord[]> {
    const url =
      this.configService.get<string>('WISPACE_API_TASK_SCORE_URL') ??
      'https://backend.aihubproduction.com/api/TaskScoreAverage';

    const maxRetries = this.readPositiveInt('WISPACE_API_MAX_RETRIES', 3);
    const baseDelayMs = this.readPositiveInt(
      'WISPACE_API_RETRY_BASE_DELAY_MS',
      500,
    );

    return withRetry(() => this.doFetchTaskScoreAverages(url, psid), {
      maxRetries,
      baseDelayMs,
      shouldRetry: isWispaceRetryable,
      onRetry: (attempt, max, err) =>
        this.logger.warn(
          `TaskScoreAverage retry ${attempt}/${max} (psid=${psid}): ${err instanceof Error ? err.message : String(err)}`,
        ),
    });
  }

  private async doFetchTaskScoreAverages(
    url: string,
    psid: string,
  ): Promise<TaskScoreAverageRecord[]> {
    const response = await fetch(url, {
      headers: this.userGoalsApiService.buildWispaceHeaders(psid),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new WispaceApiError(
        `TaskScoreAverage API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
        response.status,
        psid,
        'TaskScoreAverage',
      );
    }

    const data = (await response.json()) as TaskScoreAverageRecord[];
    this.logger.log(
      `TaskScoreAverage API returned ${data.length} record(s) (psid=${psid})`,
    );
    return data;
  }

  private readPositiveInt(key: string, defaultValue: number): number {
    const raw = this.configService.get<string>(key)?.trim();
    if (!raw) return defaultValue;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : defaultValue;
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

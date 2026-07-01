import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../../metrics/metrics.service';
import { WispaceApiError } from '../../domain/errors/wispace-api.error';
import { UserGoalsRecord } from '../../domain/types/user-goals.types';
import { withRetry } from '../../../../shared/common/with-retry';
import { parseExamDateToIso } from '../../../../shared/utils/exam-date.utils';

/** Retry on 5xx Wispace errors or transient network failures. Never retry 4xx. */
function isWispaceRetryable(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === 'object' &&
    'isRetryable' in error &&
    typeof error.isRetryable === 'function'
  ) {
    return (error as { isRetryable: () => boolean }).isRetryable();
  }
  return error instanceof TypeError; // network / DNS error
}

@Injectable()
export class UserGoalsApiService {
  private readonly logger = new Logger(UserGoalsApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  async getUserGoals(psid: string): Promise<UserGoalsRecord> {
    const url =
      this.configService.get<string>('WISPACE_API_USER_GOALS_URL') ??
      'https://backend.aihubproduction.com/api/User/goals';

    return this.metrics.timeWispaceCall('UserGoals', 'get', () =>
      withRetry(() => this.fetchUserGoals(url, psid), {
        ...this.retryOptions(),
        shouldRetry: isWispaceRetryable,
        onRetry: (attempt, max, err) =>
          this.logger.warn(
            `User/goals retry ${attempt}/${max} (psid=${psid}): ${err instanceof Error ? err.message : String(err)}`,
          ),
      }),
    );
  }

  private async fetchUserGoals(
    url: string,
    psid: string,
  ): Promise<UserGoalsRecord> {
    const response = await fetch(url, {
      headers: this.buildWispaceHeaders(psid),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new WispaceApiError(
        `User goals API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
        response.status,
        psid,
        'User/goals',
      );
    }

    const data = (await response.json()) as UserGoalsRecord;
    this.logger.log(
      `User goals API returned targetScore=${data.targetScore}, examDate=${data.examDate} (psid=${psid})`,
    );
    return data;
  }

  private retryOptions() {
    const maxRetries = Number(
      this.configService.get<string>('WISPACE_API_MAX_RETRIES') ?? '3',
    );
    const baseDelayMs = Number(
      this.configService.get<string>('WISPACE_API_RETRY_BASE_DELAY_MS') ??
        '500',
    );
    return {
      maxRetries:
        Number.isFinite(maxRetries) && maxRetries >= 0
          ? Math.floor(maxRetries)
          : 3,
      baseDelayMs:
        Number.isFinite(baseDelayMs) && baseDelayMs > 0
          ? Math.floor(baseDelayMs)
          : 500,
    };
  }

  parseExamDate(examDate: string): string {
    try {
      return parseExamDateToIso(examDate);
    } catch {
      throw new InternalServerErrorException(
        `User goals API returned unsupported examDate format: ${examDate}`,
      );
    }
  }

  buildWispaceHeaders(psid: string): Record<string, string> {
    if (!psid.trim()) {
      throw new InternalServerErrorException(
        'PSID is required for WISPACE API requests',
      );
    }

    const internalKey = this.configService
      .get<string>('WISPACE_INTERNAL_KEY')
      ?.trim();
    if (!internalKey) {
      throw new InternalServerErrorException(
        'WISPACE_INTERNAL_KEY must be set in .env',
      );
    }

    return {
      'x-psid': psid.trim(),
      'X-Internal-Key': internalKey,
      Accept: 'application/json',
    };
  }
}

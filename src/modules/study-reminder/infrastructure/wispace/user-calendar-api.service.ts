import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../../metrics/metrics.service';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';
import { WispaceApiError } from '../../../../shared/errors/wispace-api.error';
import {
  CreateUserCalendarInput,
  UserCalendarRecord,
} from '../../domain/entities/user-calendar.types';
import { formatEventDateForApiWrite } from '../../application/utils/study-calendar.utils';
import {
  normalizeCreatedCalendarRecord,
  normalizeUserCalendarRecords,
} from './user-calendar-record.normalizer';
import { withRetry } from '../../../../shared/common/with-retry';

function isWispaceRetryable(error: unknown): boolean {
  if (
    error !== null &&
    typeof error === 'object' &&
    'isRetryable' in error &&
    typeof error.isRetryable === 'function'
  ) {
    return (error as { isRetryable: () => boolean }).isRetryable();
  }
  return error instanceof TypeError;
}

@Injectable()
export class UserCalendarApiService {
  private readonly logger = new Logger(UserCalendarApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userGoalsApiService: UserGoalsApiService,
    private readonly metrics: MetricsService,
  ) {}

  async listCalendars(psid: string): Promise<UserCalendarRecord[]> {
    const url = this.getBaseUrl();
    const maxRetries = this.readPositiveInt('WISPACE_API_MAX_RETRIES', 3);
    const baseDelayMs = this.readPositiveInt(
      'WISPACE_API_RETRY_BASE_DELAY_MS',
      500,
    );

    return this.metrics.timeWispaceCall('UserCalendar', 'list', () =>
      withRetry(() => this.doListCalendars(url, psid), {
        maxRetries,
        baseDelayMs,
        shouldRetry: isWispaceRetryable,
        onRetry: (attempt, max, err) =>
          this.logger.warn(
            `UserCalendar retry ${attempt}/${max} (psid=${psid}): ${err instanceof Error ? err.message : String(err)}`,
          ),
      }),
    );
  }

  private async doListCalendars(
    url: string,
    psid: string,
  ): Promise<UserCalendarRecord[]> {
    const response = await fetch(url, {
      headers: this.userGoalsApiService.buildWispaceHeaders(psid),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new WispaceApiError(
        `UserCalendar API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
        response.status,
        psid,
        'UserCalendar',
      );
    }

    const payload: unknown = await response.json();
    const records = normalizeUserCalendarRecords(payload);

    this.logger.log(
      `UserCalendar API returned ${records.length} record(s) (psid=${psid})`,
    );

    return records;
  }

  async createCalendar(
    psid: string,
    input: CreateUserCalendarInput,
    options?: { userId?: number },
  ): Promise<UserCalendarRecord> {
    return this.metrics.timeWispaceCall('UserCalendar', 'create', () =>
      this.doCreateCalendar(psid, input, options),
    );
  }

  private async doCreateCalendar(
    psid: string,
    input: CreateUserCalendarInput,
    options?: { userId?: number },
  ): Promise<UserCalendarRecord> {
    const url = this.getBaseUrl();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.userGoalsApiService.buildWispaceHeaders(psid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventDate: formatEventDateForApiWrite(input.eventDate),
        time: input.time,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `UserCalendar API create failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const payload: unknown = await response.json();
    const created = normalizeCreatedCalendarRecord(payload, {
      eventDate: input.eventDate,
      time: input.time,
      userId: options?.userId,
    });
    if (!created) {
      throw new InternalServerErrorException(
        `UserCalendar API create returned invalid record: ${JSON.stringify(payload)}`,
      );
    }

    this.logger.log(`UserCalendar API created id=${created.id} (psid=${psid})`);

    return created;
  }

  async deleteCalendar(psid: string, calendarId: number): Promise<void> {
    return this.metrics.timeWispaceCall('UserCalendar', 'delete', () =>
      this.doDeleteCalendar(psid, calendarId),
    );
  }

  private async doDeleteCalendar(
    psid: string,
    calendarId: number,
  ): Promise<void> {
    const url = `${this.getBaseUrl()}/${calendarId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.userGoalsApiService.buildWispaceHeaders(psid),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `UserCalendar API delete failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }
  }

  private readPositiveInt(key: string, defaultValue: number): number {
    const raw = this.configService.get<string>(key)?.trim();
    if (!raw) return defaultValue;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : defaultValue;
  }

  private getBaseUrl(): string {
    const url = this.configService
      .get<string>('WISPACE_API_USER_CALENDAR_URL')
      ?.trim();

    if (!url) {
      throw new InternalServerErrorException(
        'WISPACE_API_USER_CALENDAR_URL must be set in .env',
      );
    }

    return url;
  }
}

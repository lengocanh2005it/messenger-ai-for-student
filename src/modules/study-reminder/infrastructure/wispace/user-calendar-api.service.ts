import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';
import {
  CreateUserCalendarInput,
  UserCalendarRecord,
} from '../../domain/entities/user-calendar.types';
import { formatEventDateForApiWrite } from '../../application/utils/study-calendar.utils';
import {
  normalizeCreatedCalendarRecord,
  normalizeUserCalendarRecords,
} from './user-calendar-record.normalizer';

@Injectable()
export class UserCalendarApiService {
  private readonly logger = new Logger(UserCalendarApiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly userGoalsApiService: UserGoalsApiService,
  ) {}

  async listCalendars(psid: string): Promise<UserCalendarRecord[]> {
    const url = this.getBaseUrl();
    const response = await fetch(url, {
      headers: this.userGoalsApiService.buildWispaceHeaders(psid),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `UserCalendar API failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }

    const payload = await response.json();
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

    const payload = await response.json();
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

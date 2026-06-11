import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';
import {
  CreateUserCalendarInput,
  UserCalendarListResponse,
  UserCalendarRecord,
} from '../../domain/entities/user-calendar.types';

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

    const payload = (await response.json()) as UserCalendarListResponse;
    const records = Array.isArray(payload.data) ? payload.data : [];

    this.logger.log(
      `UserCalendar API returned ${records.length} record(s) (psid=${psid})`,
    );

    return records;
  }

  async createCalendar(
    psid: string,
    input: CreateUserCalendarInput,
  ): Promise<UserCalendarRecord> {
    const url = this.getBaseUrl();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.userGoalsApiService.buildWispaceHeaders(psid),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `UserCalendar API create failed: HTTP ${response.status} ${response.statusText} - ${body}`,
      );
    }

    return (await response.json()) as UserCalendarRecord;
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

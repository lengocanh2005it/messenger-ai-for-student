import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserCalendarApiService } from './user-calendar-api.service';
import { UserCalendarRecord } from './user-calendar.types';
import { NormalizedStudySession } from './study-schedule.types';

interface UserCalendarRow {
  Id: number;
  EventDate: Date | string;
  Time: string | null;
}

@Injectable()
export class UserCalendarScheduleService {
  private readonly logger = new Logger(UserCalendarScheduleService.name);

  constructor(
    private readonly userCalendarApiService: UserCalendarApiService,
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async getUpcomingSessions(
    psid: string,
    horizonEnd: Date,
    userId?: number,
  ): Promise<NormalizedStudySession[]> {
    try {
      const records = await this.userCalendarApiService.listCalendars(psid);
      const fromApi = this.normalizeAndFilter(records, horizonEnd);

      if (fromApi.length > 0 || !userId) {
        return fromApi;
      }

      this.logger.warn(
        `UserCalendar API returned 0 upcoming session(s) for psid=${psid}, falling back to DB userId=${userId}`,
      );

      return this.getUpcomingSessionsFromDb(userId, horizonEnd);
    } catch (error) {
      if (!userId) {
        throw error;
      }

      this.logger.warn(
        `UserCalendar API failed for psid=${psid}, falling back to DB UserCalendars: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return this.getUpcomingSessionsFromDb(userId, horizonEnd);
    }
  }

  private async getUpcomingSessionsFromDb(
    userId: number,
    horizonEnd: Date,
  ): Promise<NormalizedStudySession[]> {
    const rows = (await this.dataSource.query(
      `
      SELECT "Id", "EventDate", "Time"
      FROM "UserCalendars"
      WHERE "UserId" = $1
        AND "EventDate" > NOW() - INTERVAL '1 hour'
        AND "EventDate" <= $2
      ORDER BY "EventDate" ASC
      `,
      [userId, horizonEnd],
    )) as UserCalendarRow[];

    return rows
      .map((row) =>
        this.normalizeRecord({
          id: row.Id,
          userId,
          eventDate:
            row.EventDate instanceof Date
              ? row.EventDate.toISOString()
              : String(row.EventDate),
          time: row.Time,
        }),
      )
      .filter((session): session is NormalizedStudySession => session !== null)
      .filter(
        (session) => session.scheduledAt.getTime() <= horizonEnd.getTime(),
      );
  }

  private normalizeAndFilter(
    records: UserCalendarRecord[],
    horizonEnd: Date,
  ): NormalizedStudySession[] {
    const now = Date.now() - 60 * 60 * 1000;

    return records
      .map((record) => this.normalizeRecord(record))
      .filter((session): session is NormalizedStudySession => session !== null)
      .filter(
        (session) =>
          session.scheduledAt.getTime() > now &&
          session.scheduledAt.getTime() <= horizonEnd.getTime(),
      )
      .sort(
        (left, right) =>
          left.scheduledAt.getTime() - right.scheduledAt.getTime(),
      );
  }

  private normalizeRecord(
    record: UserCalendarRecord,
  ): NormalizedStudySession | null {
    const scheduledAt = this.resolveScheduledAt(record.eventDate, record.time);
    if (Number.isNaN(scheduledAt.getTime())) {
      return null;
    }

    if (scheduledAt.getTime() <= Date.now()) {
      return null;
    }

    return {
      sessionKey: `calendar:${record.id}`,
      scheduledAt,
      topic: 'IELTS Writing',
    };
  }

  private resolveScheduledAt(eventDate: string, time: string | null): Date {
    const trimmedTime = time?.trim();
    if (!trimmedTime) {
      return new Date(eventDate);
    }

    const [hourText, minuteText] = trimmedTime.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return new Date(eventDate);
    }

    const timezone =
      this.configService.get<string>('STUDY_REMINDER_TIMEZONE')?.trim() ??
      'Asia/Ho_Chi_Minh';
    const dateParts = this.getDatePartsInTimezone(
      new Date(eventDate),
      timezone,
    );
    const pad = (value: number) => String(value).padStart(2, '0');
    const offset = this.getUtcOffsetForTimezone(timezone, dateParts);

    return new Date(
      `${dateParts.year}-${pad(dateParts.month)}-${pad(dateParts.day)}T${pad(hour)}:${pad(minute)}:00${offset}`,
    );
  }

  private getDatePartsInTimezone(
    date: Date,
    timezone: string,
  ): { year: number; month: number; day: number } {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [year, month, day] = formatter.format(date).split('-').map(Number);

    return { year, month, day };
  }

  private getUtcOffsetForTimezone(
    timezone: string,
    dateParts: { year: number; month: number; day: number },
  ): string {
    const probe = new Date(
      Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 12, 0, 0),
    );
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(probe);
    const label = parts.find((part) => part.type === 'timeZoneName')?.value;

    if (!label || label === 'GMT') {
      return 'Z';
    }

    const match = label.match(/^GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/);
    if (!match) {
      return 'Z';
    }

    const sign = match[1] ?? '+';
    const hours = Number(match[2] ?? 0);
    const minutes = Number(match[3] ?? 0);
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${sign}${pad(hours)}:${pad(minutes)}`;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  formatStoredCalendarDate,
  resolveScheduledAtFromEventDate,
} from '../../application/utils/study-calendar.utils';
import { UserCalendarApiService } from './user-calendar-api.service';
import { UserCalendarRecord } from '../../domain/entities/user-calendar.types';
import {
  CalendarSessionTimeRange,
  NormalizedStudySession,
} from '../../domain/entities/study-schedule.types';

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
    return this.getCalendarSessions(psid, horizonEnd, {
      timeRange: 'upcoming',
      userId,
    });
  }

  async findCalendarRecord(
    psid: string,
    calendarId: number,
    userId?: number,
  ): Promise<UserCalendarRecord | null> {
    const records = await this.userCalendarApiService.listCalendars(psid);
    const fromApi = records.find((record) => record.id === calendarId);
    if (fromApi) {
      return fromApi;
    }

    if (!userId) {
      return null;
    }

    const rows = await this.dataSource.query<UserCalendarRow[]>(
      `
      SELECT "Id", "EventDate", "Time"
      FROM "UserCalendars"
      WHERE "Id" = $1 AND "UserId" = $2
      LIMIT 1
      `,
      [calendarId, userId],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      id: row.Id,
      userId,
      eventDate: this.formatStoredEventDate(row.EventDate),
      time: row.Time,
    };
  }

  async getCalendarSessions(
    psid: string,
    horizonEnd: Date,
    options: {
      timeRange?: CalendarSessionTimeRange;
      userId?: number;
      pastDays?: number;
      limit?: number;
    } = {},
  ): Promise<NormalizedStudySession[]> {
    const timeRange = options.timeRange ?? 'upcoming';
    const pastDays = options.pastDays ?? 90;

    try {
      const records = await this.userCalendarApiService.listCalendars(psid);
      let sessions = records
        .map((record) => this.buildSession(record))
        .filter(
          (session): session is NormalizedStudySession => session !== null,
        );

      sessions = this.filterSessionsByTimeRange(sessions, {
        timeRange,
        horizonEnd,
        pastDays,
      });

      if (sessions.length === 0 && options.userId) {
        if (timeRange === 'upcoming' || timeRange === 'all') {
          const upcoming = await this.getUpcomingSessionsFromDb(
            options.userId,
            horizonEnd,
          );
          sessions =
            timeRange === 'all'
              ? [
                  ...this.filterSessionsByTimeRange(
                    await this.getPastSessionsFromDb(options.userId, pastDays),
                    { timeRange: 'past', horizonEnd, pastDays },
                  ),
                  ...upcoming,
                ]
              : upcoming;
        } else if (timeRange === 'past') {
          sessions = await this.getPastSessionsFromDb(options.userId, pastDays);
        }
      }

      sessions = this.sortSessions(sessions, timeRange);

      if (options.limit && options.limit > 0) {
        sessions = sessions.slice(0, options.limit);
      }

      return sessions;
    } catch (error) {
      if (!options.userId) {
        throw error;
      }

      this.logger.warn(
        `UserCalendar API failed for psid=${psid}, falling back to DB UserCalendars: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      if (timeRange === 'past') {
        return this.getPastSessionsFromDb(options.userId, pastDays);
      }

      if (timeRange === 'all') {
        const upcoming = await this.getUpcomingSessionsFromDb(
          options.userId,
          horizonEnd,
        );
        const past = await this.getPastSessionsFromDb(options.userId, pastDays);
        return this.sortSessions([...past, ...upcoming], 'all');
      }

      return this.getUpcomingSessionsFromDb(options.userId, horizonEnd);
    }
  }

  private async getUpcomingSessionsFromDb(
    userId: number,
    horizonEnd: Date,
  ): Promise<NormalizedStudySession[]> {
    const rows = await this.dataSource.query<UserCalendarRow[]>(
      `
      SELECT "Id", "EventDate", "Time"
      FROM "UserCalendars"
      WHERE "UserId" = $1
        AND "EventDate" > NOW() - INTERVAL '1 hour'
        AND "EventDate" <= $2
      ORDER BY "EventDate" ASC
      `,
      [userId, horizonEnd],
    );

    const sessions = rows
      .map((row) =>
        this.buildSession({
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

    return sessions;
  }

  private async getPastSessionsFromDb(
    userId: number,
    pastDays: number,
  ): Promise<NormalizedStudySession[]> {
    const rows = await this.dataSource.query<UserCalendarRow[]>(
      `
      SELECT "Id", "EventDate", "Time"
      FROM "UserCalendars"
      WHERE "UserId" = $1
        AND "EventDate" <= NOW() - INTERVAL '1 hour'
        AND "EventDate" >= NOW() - ($2::int * INTERVAL '1 day')
      ORDER BY "EventDate" DESC
      `,
      [userId, pastDays],
    );

    return rows
      .map((row) =>
        this.buildSession({
          id: row.Id,
          userId,
          eventDate:
            row.EventDate instanceof Date
              ? row.EventDate.toISOString()
              : String(row.EventDate),
          time: row.Time,
        }),
      )
      .filter((session): session is NormalizedStudySession => session !== null);
  }

  private buildSession(
    record: UserCalendarRecord,
  ): NormalizedStudySession | null {
    const scheduledAt = this.resolveScheduledAt(record.eventDate, record.time);
    if (Number.isNaN(scheduledAt.getTime())) {
      return null;
    }

    return {
      sessionKey: `calendar:${record.id}`,
      scheduledAt,
      topic: 'IELTS Writing',
    };
  }

  private filterSessionsByTimeRange(
    sessions: NormalizedStudySession[],
    params: {
      timeRange: CalendarSessionTimeRange;
      horizonEnd: Date;
      pastDays: number;
    },
  ): NormalizedStudySession[] {
    const now = Date.now();
    const upcomingCutoff = now - 60 * 60 * 1000;
    const pastCutoff = now - params.pastDays * 24 * 60 * 60 * 1000;

    return sessions.filter((session) => {
      const scheduledAtMs = session.scheduledAt.getTime();

      if (params.timeRange === 'upcoming') {
        return (
          scheduledAtMs > upcomingCutoff &&
          scheduledAtMs <= params.horizonEnd.getTime()
        );
      }

      if (params.timeRange === 'past') {
        return scheduledAtMs <= upcomingCutoff && scheduledAtMs >= pastCutoff;
      }

      return (
        scheduledAtMs >= pastCutoff &&
        scheduledAtMs <= params.horizonEnd.getTime()
      );
    });
  }

  private sortSessions(
    sessions: NormalizedStudySession[],
    timeRange: CalendarSessionTimeRange,
  ): NormalizedStudySession[] {
    const sorted = [...sessions].sort(
      (left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime(),
    );

    if (timeRange === 'past') {
      sorted.reverse();
    }

    return sorted;
  }

  private resolveScheduledAt(eventDate: string, time: string | null): Date {
    const trimmedTime = time?.trim();
    if (!trimmedTime) {
      return new Date(eventDate);
    }

    const timezone =
      this.configService.get<string>('STUDY_REMINDER_TIMEZONE')?.trim() ??
      'Asia/Ho_Chi_Minh';

    return resolveScheduledAtFromEventDate(eventDate, trimmedTime, timezone);
  }

  private formatStoredEventDate(value: Date | string): string {
    const timezone =
      this.configService.get<string>('STUDY_REMINDER_TIMEZONE')?.trim() ??
      'Asia/Ho_Chi_Minh';

    return formatStoredCalendarDate(value, timezone);
  }
}

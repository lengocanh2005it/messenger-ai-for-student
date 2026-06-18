import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveScheduledAtFromEventDate } from '../../application/utils/study-calendar.utils';
import { UserCalendarApiService } from './user-calendar-api.service';
import { WispaceApiError } from '../../../student-report/domain/errors/wispace-api.error';
import { UserCalendarRecord } from '../../domain/entities/user-calendar.types';
import {
  CalendarSessionTimeRange,
  NormalizedStudySession,
} from '../../domain/entities/study-schedule.types';

@Injectable()
export class UserCalendarScheduleService {
  private readonly logger = new Logger(UserCalendarScheduleService.name);

  constructor(
    private readonly userCalendarApiService: UserCalendarApiService,
    private readonly configService: ConfigService,
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
  ): Promise<UserCalendarRecord | null> {
    const records = await this.userCalendarApiService.listCalendars(psid);
    return records.find((record) => record.id === calendarId) ?? null;
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
      sessions = this.sortSessions(sessions, timeRange);

      if (options.limit && options.limit > 0) {
        sessions = sessions.slice(0, options.limit);
      }

      return sessions;
    } catch (error) {
      if (!options.userId) {
        throw error;
      }

      this.logCalendarApiFailure(psid, error);
      return [];
    }
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

  private logCalendarApiFailure(psid: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const unknownPsid =
      error instanceof WispaceApiError && error.statusCode === 401;

    if (unknownPsid) {
      this.logger.debug(
        `UserCalendar skipped for psid=${psid} — Wispace does not recognize x-psid`,
      );
      return;
    }

    this.logger.warn(`UserCalendar API failed for psid=${psid}: ${message}`);
  }
}

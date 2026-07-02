import { Injectable, Logger } from '@nestjs/common';
import {
  UserCalendarApiClient,
  UserCalendarScheduleClient,
  type CalendarSessionTimeRange,
  type CreateUserCalendarInput,
  type NormalizedStudySession,
  type UserCalendarRecord,
} from '@wispace/wispace-client';
import { WispaceConfigService } from './wispace-config.service';

const ID_HEADER = 'x-discordid' as const;

@Injectable()
export class WispaceCalendarService {
  private readonly logger = new Logger(WispaceCalendarService.name);
  private apiClient?: UserCalendarApiClient;
  private scheduleClient?: UserCalendarScheduleClient;

  constructor(private readonly configService: WispaceConfigService) {}

  getCalendarSessions(
    discordUserId: string,
    options: {
      timeRange?: CalendarSessionTimeRange;
      pastDays?: number;
      limit?: number;
    } = {},
  ): Promise<NormalizedStudySession[]> {
    const horizonEnd = new Date(
      Date.now() + this.configService.getSyncHorizonHours() * 60 * 60 * 1000,
    );

    return this.getScheduleClient().getCalendarSessions(
      ID_HEADER,
      discordUserId,
      horizonEnd,
      { ...options, swallowErrors: true },
    );
  }

  listCalendars(discordUserId: string): Promise<UserCalendarRecord[]> {
    return this.getApiClient().listCalendars(ID_HEADER, discordUserId);
  }

  findCalendarRecord(
    discordUserId: string,
    calendarId: number,
  ): Promise<UserCalendarRecord | null> {
    return this.getScheduleClient().findCalendarRecord(
      ID_HEADER,
      discordUserId,
      calendarId,
    );
  }

  createCalendar(
    discordUserId: string,
    input: CreateUserCalendarInput,
    options?: { userId?: number },
  ): Promise<UserCalendarRecord> {
    return this.getApiClient().createCalendar(
      ID_HEADER,
      discordUserId,
      input,
      options,
    );
  }

  deleteCalendar(discordUserId: string, calendarId: number): Promise<void> {
    return this.getApiClient().deleteCalendar(
      ID_HEADER,
      discordUserId,
      calendarId,
    );
  }

  private getApiClient(): UserCalendarApiClient {
    if (!this.apiClient) {
      this.apiClient = new UserCalendarApiClient(
        this.configService.buildCalendarClientConfig(),
        { warn: (m) => this.logger.warn(m), log: (m) => this.logger.log(m) },
      );
    }

    return this.apiClient;
  }

  private getScheduleClient(): UserCalendarScheduleClient {
    if (!this.scheduleClient) {
      this.scheduleClient = new UserCalendarScheduleClient(
        (idHeader, externalId) =>
          this.getApiClient().listCalendars(idHeader, externalId),
        this.configService.getTimezone(),
        { warn: (m) => this.logger.warn(m), log: (m) => this.logger.log(m) },
      );
    }

    return this.scheduleClient;
  }
}

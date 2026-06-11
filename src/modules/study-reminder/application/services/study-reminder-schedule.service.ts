import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StudyReminderScheduleService {
  constructor(private readonly configService: ConfigService) {}

  getOutboxSettings(): {
    minutesBefore: number;
    minLeadMinutes: number;
    syncHorizonHours: number;
    maxRetries: number;
    retryBackoffMinutes: number;
    jobRetentionDays: number;
    eveningRolloverHour: number;
    timezone: string;
  } {
    return {
      minutesBefore: this.getMinutesBefore(),
      minLeadMinutes: this.getMinLeadMinutes(),
      syncHorizonHours: this.getSyncHorizonHours(),
      maxRetries: this.getMaxRetries(),
      retryBackoffMinutes: this.getRetryBackoffMinutes(),
      jobRetentionDays: this.getJobRetentionDays(),
      eveningRolloverHour: this.getEveningRolloverHour(),
      timezone: this.getTimezone(),
    };
  }

  computeRemindAt(scheduledAt: Date): Date {
    const minutesBefore = this.getMinutesBefore();
    return new Date(scheduledAt.getTime() - minutesBefore * 60 * 1000);
  }

  getMinutesUntilSession(scheduledAt: Date, now = new Date()): number {
    return (scheduledAt.getTime() - now.getTime()) / (1000 * 60);
  }

  isSessionStarted(scheduledAt: Date, now = new Date()): boolean {
    return (
      this.getMinutesUntilSession(scheduledAt, now) <= this.getMinLeadMinutes()
    );
  }

  formatScheduledTimeLabel(scheduledAt: Date): string {
    const timezone = this.getTimezone();
    const now = new Date();
    const todayParts = this.getDatePartsInTimezone(now, timezone);
    const sessionParts = this.getDatePartsInTimezone(scheduledAt, timezone);

    const isToday =
      todayParts.year === sessionParts.year &&
      todayParts.month === sessionParts.month &&
      todayParts.day === sessionParts.day;

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowParts = this.getDatePartsInTimezone(tomorrow, timezone);
    const isTomorrow =
      tomorrowParts.year === sessionParts.year &&
      tomorrowParts.month === sessionParts.month &&
      tomorrowParts.day === sessionParts.day;

    const timeText = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(scheduledAt);

    if (isToday) {
      return `Hôm nay lúc ${timeText}`;
    }

    if (isTomorrow) {
      return `Ngày mai lúc ${timeText}`;
    }

    const dateText = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: timezone,
    }).format(scheduledAt);

    return `${dateText} lúc ${timeText}`;
  }

  private getMinutesBefore(): number {
    return this.readRequiredPositiveNumber('STUDY_REMINDER_MINUTES_BEFORE');
  }

  private getMinLeadMinutes(): number {
    return this.readRequiredPositiveNumber('STUDY_REMINDER_MIN_LEAD_MINUTES');
  }

  private getSyncHorizonHours(): number {
    return this.readRequiredPositiveNumber('STUDY_REMINDER_SYNC_HORIZON_HOURS');
  }

  private getMaxRetries(): number {
    return this.readRequiredPositiveNumber('STUDY_REMINDER_MAX_RETRIES');
  }

  private getRetryBackoffMinutes(): number {
    return this.readRequiredPositiveNumber(
      'STUDY_REMINDER_RETRY_BACKOFF_MINUTES',
    );
  }

  private getJobRetentionDays(): number {
    return this.readRequiredPositiveNumber('STUDY_REMINDER_JOB_RETENTION_DAYS');
  }

  private getEveningRolloverHour(): number {
    const raw = this.configService
      .get<string>('STUDY_REMINDER_EVENING_ROLLOVER_HOUR')
      ?.trim();

    if (!raw) {
      return 23;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 23) {
      throw new InternalServerErrorException(
        'STUDY_REMINDER_EVENING_ROLLOVER_HOUR must be an integer from 0 to 23 in .env',
      );
    }

    return value;
  }

  private getTimezone(): string {
    const timezone = this.configService
      .get<string>('STUDY_REMINDER_TIMEZONE')
      ?.trim();

    if (!timezone) {
      throw new InternalServerErrorException(
        'STUDY_REMINDER_TIMEZONE must be set in .env',
      );
    }

    return timezone;
  }

  private readRequiredPositiveNumber(key: string): number {
    const raw = this.configService.get<string>(key)?.trim();

    if (!raw) {
      throw new InternalServerErrorException(`${key} must be set in .env`);
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new InternalServerErrorException(
        `${key} must be a positive number in .env`,
      );
    }

    return value;
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
}

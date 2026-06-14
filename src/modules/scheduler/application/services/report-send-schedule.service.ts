import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ReportSendScheduleService {
  constructor(private readonly configService: ConfigService) {}

  getOutboxSettings(): {
    maxRetries: number;
    retryBackoffMinutes: number;
    retryPollCronMinutes: number;
    timezone: string;
  } {
    return {
      maxRetries: this.readRequiredPositiveNumber('REPORT_SEND_MAX_RETRIES'),
      retryBackoffMinutes: this.readRequiredPositiveNumber(
        'REPORT_SEND_RETRY_BACKOFF_MINUTES',
      ),
      retryPollCronMinutes: this.readRequiredPositiveNumber(
        'REPORT_SEND_RETRY_POLL_MINUTES',
      ),
      timezone:
        this.configService.get<string>('CHAT_USAGE_TIMEZONE')?.trim() ||
        'Asia/Ho_Chi_Minh',
    };
  }

  private readRequiredPositiveNumber(key: string): number {
    const raw = this.configService.get<string>(key)?.trim();

    if (!raw) {
      throw new InternalServerErrorException(
        `Missing required env ${key} for report send outbox (R5)`,
      );
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new InternalServerErrorException(
        `${key} must be a positive number (got ${raw})`,
      );
    }

    return value;
  }
}

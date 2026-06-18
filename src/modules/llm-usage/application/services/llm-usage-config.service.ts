import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function todayUsageDate(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

@Injectable()
export class LlmUsageConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('LLM_USAGE_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getTimezone(): string {
    const timezone = this.configService
      .get<string>('LLM_USAGE_TIMEZONE')
      ?.trim();

    if (!timezone) {
      throw new InternalServerErrorException(
        'LLM_USAGE_TIMEZONE must be set in .env',
      );
    }

    return timezone;
  }

  getRetentionDays(): number {
    const raw = this.configService
      .get<string>('LLM_USAGE_RETENTION_DAYS')
      ?.trim();

    if (!raw) {
      return 180;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return 180;
    }

    return Math.floor(value);
  }

  todayUsageDate(now = new Date()): string {
    return todayUsageDate(this.getTimezone(), now);
  }
}

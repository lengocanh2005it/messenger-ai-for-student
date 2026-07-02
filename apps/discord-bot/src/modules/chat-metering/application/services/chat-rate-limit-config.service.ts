import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatRateLimitSettings } from '@wispace/chat-metering';

@Injectable()
export class ChatRateLimitConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('CHAT_RATE_LIMIT_ENABLED')
      ?.trim()
      .toLowerCase();

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getSettings(): ChatRateLimitSettings {
    return {
      freeFormDailyLimit: this.readRequiredPositiveNumber(
        'CHAT_FREE_FORM_DAILY_LIMIT',
      ),
      burstPerMinute: this.readRequiredPositiveNumber('CHAT_BURST_PER_MINUTE'),
      timezone: this.getTimezone(),
    };
  }

  private getTimezone(): string {
    const timezone = this.configService
      .get<string>('CHAT_USAGE_TIMEZONE')
      ?.trim();

    if (!timezone) {
      throw new InternalServerErrorException(
        'CHAT_USAGE_TIMEZONE must be set in .env',
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
}

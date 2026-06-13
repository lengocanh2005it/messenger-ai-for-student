import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatRateLimitSettings } from '../../domain/entities/chat-quota.types';

@Injectable()
export class ChatRateLimitConfigService {
  constructor(private readonly configService: ConfigService) {}

  getSettings(): ChatRateLimitSettings {
    return {
      enabled: this.isEnabled(),
      freeFormDailyLimit: this.getFreeFormDailyLimit(),
      burstPerMinute: this.getBurstPerMinute(),
      timezone: this.getTimezone(),
      whitelistedPsids: this.getWhitelistedPsids(),
      remainingHintThreshold: this.getRemainingHintThreshold(),
    };
  }

  isWhitelisted(psid: string): boolean {
    return this.getWhitelistedPsids().includes(psid);
  }

  shouldEnforceForPsid(psid: string): boolean {
    return this.isEnabled() && !this.isWhitelisted(psid);
  }

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('CHAT_RATE_LIMIT_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return false;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getFreeFormDailyLimit(): number {
    return this.readRequiredPositiveNumber('CHAT_FREE_FORM_DAILY_LIMIT');
  }

  getBurstPerMinute(): number {
    return this.readRequiredPositiveNumber('CHAT_BURST_PER_MINUTE');
  }

  getTimezone(): string {
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

  getWhitelistedPsids(): string[] {
    const raw = this.configService
      .get<string>('CHAT_RATE_LIMIT_WHITELIST_PSIDS')
      ?.trim();

    if (!raw) {
      return [];
    }

    return raw
      .split(',')
      .map((psid) => psid.trim())
      .filter((psid) => psid.length > 0);
  }

  getRemainingHintThreshold(): number {
    return this.readRequiredPositiveNumber(
      'CHAT_QUOTA_REMAINING_HINT_THRESHOLD',
    );
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

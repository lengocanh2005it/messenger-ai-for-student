import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatRateLimitSettings } from '../../domain/entities/chat-quota.types';
import type { ChatBurstStoreKind } from '../../domain/entities/chat-burst.types';

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
      stuckReservedMs: this.getStuckReservedMs(),
      mergedTextMaxChars: this.getMergedTextMaxChars(),
      burstCountsRefunded: this.getBurstCountsRefunded(),
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

  /** Default 10 minutes — H2 stuck `reserved` recovery. */
  getStuckReservedMs(): number {
    const raw = this.configService
      .get<string>('CHAT_IDEMPOTENCY_STUCK_RESERVED_MS')
      ?.trim();

    if (!raw) {
      return 600_000;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new InternalServerErrorException(
        'CHAT_IDEMPOTENCY_STUCK_RESERVED_MS must be a positive number in .env',
      );
    }

    return Math.floor(value);
  }

  /** H5: cap merged debounce text before LLM (default 4000). */
  getMergedTextMaxChars(): number {
    const raw = this.configService
      .get<string>('CHAT_MERGED_TEXT_MAX_CHARS')
      ?.trim();

    if (!raw) {
      return 4000;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new InternalServerErrorException(
        'CHAT_MERGED_TEXT_MAX_CHARS must be a positive number in .env',
      );
    }

    return Math.floor(value);
  }

  /**
   * H5: when false (default), burst window ignores refunded idempotency rows.
   */
  getBurstCountsRefunded(): boolean {
    const raw = this.configService
      .get<string>('CHAT_BURST_COUNT_REFUNDED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return false;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getBurstStore(): ChatBurstStoreKind {
    const raw = this.configService
      .get<string>('CHAT_BURST_STORE')
      ?.trim()
      .toLowerCase();

    if (raw === 'memory' || raw === 'postgres' || raw === 'redis') {
      return raw;
    }

    return 'postgres';
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

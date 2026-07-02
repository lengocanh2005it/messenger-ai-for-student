import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildInputCostEnvKey,
  buildOutputCostEnvKey,
  estimateCostUsd,
  todayUsageDate,
} from '@wispace/chat-metering';

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

  /** BullMQ writer — requires REDIS_ENABLED=true (default on when Redis on). */
  isBullMqEnabled(): boolean {
    const raw = this.configService
      .get<string>('LLM_USAGE_BULLMQ_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getBullMqAttempts(): number {
    const raw = this.configService
      .get<string>('LLM_USAGE_BULLMQ_ATTEMPTS')
      ?.trim();

    if (!raw) {
      return 3;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return 3;
    }

    return Math.floor(value);
  }

  getBullMqBackoffMs(): number {
    const raw = this.configService
      .get<string>('LLM_USAGE_BULLMQ_BACKOFF_MS')
      ?.trim();

    if (!raw) {
      return 2_000;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return 2_000;
    }

    return Math.floor(value);
  }

  getModelInputUsdPer1M(model: string): number | null {
    return this.readPositiveNumber(buildInputCostEnvKey(model));
  }

  getModelOutputUsdPer1M(model: string): number | null {
    return this.readPositiveNumber(buildOutputCostEnvKey(model));
  }

  estimateCostUsdForModel(
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): string | null {
    return estimateCostUsd(
      promptTokens,
      completionTokens,
      this.getModelInputUsdPer1M(model),
      this.getModelOutputUsdPer1M(model),
    );
  }

  getCostDisclaimer(): string {
    return 'Estimated from env LLM_COST_USD_PER_1M_* pricing; not an OpenAI invoice.';
  }

  private readPositiveNumber(envKey: string): number | null {
    const raw = this.configService.get<string>(envKey)?.trim();

    if (!raw) {
      return null;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }
}

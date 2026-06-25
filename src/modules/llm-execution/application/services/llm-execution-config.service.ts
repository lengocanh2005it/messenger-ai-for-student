import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LlmExecutionConfigService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('LLM_EXECUTION_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getMaxConcurrent(): number {
    const raw = this.configService.get<string>('LLM_MAX_CONCURRENT')?.trim();

    if (!raw) {
      return 3;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return 3;
    }

    return Math.floor(value);
  }

  getRetryMaxAttempts(): number {
    const raw = this.configService
      .get<string>('LLM_OPENAI_RETRY_MAX_ATTEMPTS')
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

  getRetryBackoffMs(): number {
    const raw = this.configService
      .get<string>('LLM_OPENAI_RETRY_BACKOFF_MS')
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
}

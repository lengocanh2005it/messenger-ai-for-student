import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { isOpenAiRetryableError } from '@wispace/llm-agent';
import { MetricsService } from '../../../metrics/metrics.service';
import { LlmExecutionConfigService } from './llm-execution-config.service';

export type LlmExecutionFeature =
  | 'FREE_FORM_CHAT'
  | 'STUDENT_REPORT'
  | 'STUDY_REMINDER';

export interface LlmExecutionContext {
  feature: LlmExecutionFeature;
  correlationId?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`LLM request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([Promise.resolve().then(fn), timeoutPromise]).finally(
    () => {
      if (timer) {
        clearTimeout(timer);
      }
    },
  );
}

@Injectable()
export class LlmExecutionService {
  private readonly logger = new Logger(LlmExecutionService.name);
  private limiter: ReturnType<typeof pLimit>;

  constructor(
    private readonly config: LlmExecutionConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.limiter = pLimit(this.config.getMaxConcurrent());
  }

  /**
   * Runs an OpenAI call with optional global concurrency cap (p-limit) and retry
   * on 429 / 5xx. Each chat completion.create should pass through here.
   */
  async run<T>(
    fn: () => Promise<T>,
    context?: LlmExecutionContext,
  ): Promise<T> {
    if (!this.config.isEnabled()) {
      return fn();
    }

    return this.limiter(() => this.runWithRetry(fn, context));
  }

  /** Rebuild limiter when config changes at runtime (tests). */
  refreshLimiter(): void {
    this.limiter = pLimit(this.config.getMaxConcurrent());
  }

  private async runWithRetry<T>(
    fn: () => Promise<T>,
    context?: LlmExecutionContext,
  ): Promise<T> {
    const maxAttempts = this.config.getRetryMaxAttempts();
    const baseBackoffMs = this.config.getRetryBackoffMs();
    let lastError: unknown;

    const timeoutMs = this.config.getRequestTimeoutMs();
    const feature = context?.feature ?? 'unknown';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.metrics.timeLlmExecution(feature, () =>
          withTimeout(fn, timeoutMs),
        );
      } catch (error) {
        lastError = error;

        if (!isOpenAiRetryableError(error) || attempt >= maxAttempts) {
          throw error;
        }

        const backoffMs = baseBackoffMs * attempt;
        const feature = context?.feature ?? 'unknown';
        const correlation = context?.correlationId ?? 'n/a';
        this.logger.warn(
          `OpenAI retry feature=${feature} correlation=${correlation} attempt=${attempt}/${maxAttempts} backoffMs=${backoffMs}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await sleep(backoffMs);
      }
    }

    throw lastError;
  }
}

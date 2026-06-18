import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { RedisConfigService } from '../../../../infrastructure/redis/application/services/redis-config.service';
import { runInBackground } from '../../../../shared/utils/run-in-background.utils';
import type { LlmUsageWriteJobPayload } from '../../domain/entities/llm-usage-write-job.types';
import {
  LLM_USAGE_REPOSITORY,
  type LlmUsageRepositoryPort,
} from '../../domain/repositories/llm-usage.repository.port';
import { LlmUsageConfigService } from '../../application/services/llm-usage-config.service';
import {
  LLM_USAGE_WRITE_JOB_NAME,
  LLM_USAGE_WRITE_QUEUE_NAME,
} from './llm-usage-write.queue.constants';

@Injectable()
export class LlmUsageBullQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LlmUsageBullQueueService.name);
  private queue: Queue<LlmUsageWriteJobPayload> | null = null;
  private worker: Worker<LlmUsageWriteJobPayload> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly redisConfig: RedisConfigService,
    private readonly llmConfig: LlmUsageConfigService,
    @Inject(LLM_USAGE_REPOSITORY)
    private readonly repository: LlmUsageRepositoryPort,
  ) {}

  isBullMqActive(): boolean {
    return this.redisConfig.isEnabled() && this.llmConfig.isBullMqEnabled();
  }

  /** Starts Queue + Worker on next tick — does not block Nest bootstrap. */
  onModuleInit(): void {
    if (!this.isBullMqActive()) {
      this.logger.log(
        'LLM usage write queue: inline fallback (REDIS_ENABLED=false or LLM_USAGE_BULLMQ_ENABLED=false)',
      );
      return;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      runInBackground(async () => {
        this.startQueueAndWorker();
        resolve();
      }, reject);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Non-blocking — enqueue runs on next tick; never blocks webhook/chat path. */
  enqueue(input: LlmUsageWriteJobPayload): void {
    if (!this.isBullMqActive()) {
      this.enqueueInline(input);
      return;
    }

    runInBackground(
      () => this.enqueueViaBullOrFallback(input),
      (error) => {
        this.logger.error(
          `LLM usage BullMQ background enqueue failed feature=${input.feature} correlation=${input.correlationId ?? 'n/a'}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        this.enqueueInline(input);
      },
    );
  }

  private async enqueueViaBullOrFallback(
    input: LlmUsageWriteJobPayload,
  ): Promise<void> {
    try {
      await this.initPromise;
    } catch {
      this.enqueueInline(input);
      return;
    }

    if (!this.queue) {
      this.enqueueInline(input);
      return;
    }

    try {
      await this.queue.add(LLM_USAGE_WRITE_JOB_NAME, input, {
        jobId: this.buildJobId(input),
      });
    } catch (error) {
      this.logger.error(
        `LLM usage BullMQ add failed feature=${input.feature} correlation=${input.correlationId ?? 'n/a'}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.enqueueInline(input);
    }
  }

  private startQueueAndWorker(): void {
    const connection = this.buildConnection();
    const attempts = this.llmConfig.getBullMqAttempts();
    const backoffMs = this.llmConfig.getBullMqBackoffMs();

    this.queue = new Queue<LlmUsageWriteJobPayload>(
      LLM_USAGE_WRITE_QUEUE_NAME,
      {
        connection,
        defaultJobOptions: {
          attempts,
          backoff: {
            type: 'exponential',
            delay: backoffMs,
          },
          removeOnComplete: { count: 5_000 },
          removeOnFail: { count: 10_000 },
        },
      },
    );

    this.worker = new Worker<LlmUsageWriteJobPayload>(
      LLM_USAGE_WRITE_QUEUE_NAME,
      async (job) => {
        await this.repository.insertUsage(job.data);
      },
      {
        connection,
        concurrency: 2,
      },
    );

    this.worker.on('failed', (job, error) => {
      const payload = job?.data;
      this.logger.error(
        `LLM usage BullMQ job failed id=${job?.id ?? 'n/a'} feature=${payload?.feature ?? 'n/a'} correlation=${payload?.correlationId ?? 'n/a'} attempts=${job?.attemptsMade ?? 0}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    this.logger.log(
      `LLM usage write queue active queue=${LLM_USAGE_WRITE_QUEUE_NAME} attempts=${attempts} backoffMs=${backoffMs}`,
    );
  }

  private enqueueInline(input: LlmUsageWriteJobPayload): void {
    runInBackground(
      () => this.repository.insertUsage(input),
      (error) => {
        this.logger.error(
          `LLM_USAGE_INSERT_FAILED feature=${input.feature} correlation=${input.correlationId ?? 'n/a'}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
  }

  private buildJobId(input: LlmUsageWriteJobPayload): string | undefined {
    const correlation = input.correlationId?.trim();
    if (!correlation) {
      return undefined;
    }

    const round =
      input.toolRound !== undefined && input.toolRound !== null
        ? `:r${input.toolRound}`
        : '';
    const response = input.openaiResponseId?.trim()
      ? `:${input.openaiResponseId}`
      : '';

    return `${input.feature}:${correlation}${round}${response}`.slice(0, 128);
  }

  private buildConnection(): {
    host: string;
    port: number;
    password?: string;
    maxRetriesPerRequest: null;
    lazyConnect: boolean;
  } {
    return {
      host: this.redisConfig.getHost(),
      port: this.redisConfig.getPort(),
      password: this.redisConfig.getPassword(),
      maxRetriesPerRequest: null,
      lazyConnect: true,
    };
  }
}

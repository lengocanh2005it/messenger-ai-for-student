import { Injectable, Logger } from '@nestjs/common';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import type {
  LlmUsageFeature,
  RecordLlmUsageInput,
} from '../../domain/entities/llm-usage.types';
import { LlmUsageBullQueueService } from '../../infrastructure/queue/llm-usage-bull-queue.service';
import { LlmUsageConfigService } from './llm-usage-config.service';

export interface RecordLlmUsageFromCompletionInput {
  feature: LlmUsageFeature;
  psid?: string;
  userId?: number;
  model: string;
  response: Pick<ChatCompletion, 'id' | 'usage'>;
  correlationId?: string;
  toolRound?: number;
}

@Injectable()
export class LlmUsageRecorderService {
  private readonly logger = new Logger(LlmUsageRecorderService.name);

  constructor(
    private readonly configService: LlmUsageConfigService,
    private readonly bullQueue: LlmUsageBullQueueService,
  ) {}

  isEnabled(): boolean {
    return this.configService.isEnabled();
  }

  /** Non-blocking — BullMQ enqueue (retry) or inline fallback. */
  recordFromCompletion(input: RecordLlmUsageFromCompletionInput): void {
    const usage = input.response.usage;
    if (!usage) {
      this.logger.warn(
        `LLM_USAGE_MISSING_TOKENS feature=${input.feature} correlation=${input.correlationId ?? 'n/a'}`,
      );
    }

    this.recordUsage({
      feature: input.feature,
      psid: input.psid,
      userId: input.userId,
      model: input.model,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
      openaiResponseId: input.response.id,
      correlationId: input.correlationId,
      toolRound: input.toolRound,
      estimatedCostUsd: this.configService.estimateCostUsdForModel(
        input.model,
        usage?.prompt_tokens ?? 0,
        usage?.completion_tokens ?? 0,
      ),
    });
  }

  /** Non-blocking — BullMQ enqueue (retry) or inline fallback. */
  recordUsage(input: RecordLlmUsageInput): void {
    if (!this.isEnabled()) {
      return;
    }

    const estimatedCostUsd =
      input.estimatedCostUsd !== undefined
        ? input.estimatedCostUsd
        : this.configService.estimateCostUsdForModel(
            input.model,
            input.promptTokens,
            input.completionTokens,
          );

    this.bullQueue.enqueue({
      ...input,
      estimatedCostUsd,
      usageDate: this.configService.todayUsageDate(),
    });
  }
}

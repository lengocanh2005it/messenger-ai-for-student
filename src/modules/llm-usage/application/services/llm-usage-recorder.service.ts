import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import type {
  LlmUsageFeature,
  RecordLlmUsageInput,
} from '../../domain/entities/llm-usage.types';
import {
  LLM_USAGE_REPOSITORY,
  type LlmUsageRepositoryPort,
} from '../../domain/repositories/llm-usage.repository.port';
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
    @Inject(LLM_USAGE_REPOSITORY)
    private readonly repository: LlmUsageRepositoryPort,
  ) {}

  isEnabled(): boolean {
    return this.configService.isEnabled();
  }

  async recordFromCompletion(
    input: RecordLlmUsageFromCompletionInput,
  ): Promise<void> {
    const usage = input.response.usage;
    if (!usage) {
      this.logger.warn(
        `LLM_USAGE_MISSING_TOKENS feature=${input.feature} correlation=${input.correlationId ?? 'n/a'}`,
      );
    }

    await this.recordUsage({
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
    });
  }

  async recordUsage(input: RecordLlmUsageInput): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }

    try {
      await this.repository.insertUsage({
        ...input,
        usageDate: this.configService.todayUsageDate(),
      });
    } catch (error) {
      this.logger.error(
        `LLM_USAGE_INSERT_FAILED feature=${input.feature} correlation=${input.correlationId ?? 'n/a'}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

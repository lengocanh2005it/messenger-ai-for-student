import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmUsageEventEntity } from '../../../../infrastructure/database/entities/llm-usage-event.entity';
import type { LlmUsageRepositoryPort } from '../../domain/repositories/llm-usage.repository.port';
import type { RecordLlmUsageInput } from '../../domain/entities/llm-usage.types';

@Injectable()
export class LlmUsageRepository implements LlmUsageRepositoryPort {
  constructor(
    @InjectRepository(LlmUsageEventEntity)
    private readonly usageRepo: Repository<LlmUsageEventEntity>,
  ) {}

  async insertUsage(
    input: RecordLlmUsageInput & { usageDate: string },
  ): Promise<void> {
    await this.usageRepo.manager.query(
      `
        INSERT INTO llm_usage_events (
          usage_date,
          feature,
          psid,
          user_id,
          model,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          openai_response_id,
          correlation_id,
          tool_round,
          status,
          error_message
        )
        VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        input.usageDate,
        input.feature,
        input.psid ?? null,
        input.userId ?? null,
        input.model,
        input.promptTokens,
        input.completionTokens,
        input.totalTokens,
        input.openaiResponseId ?? null,
        input.correlationId ?? null,
        input.toolRound ?? null,
        input.status ?? 'ok',
        input.errorMessage ?? null,
      ],
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const rows: Array<{ count: string }> = await this.usageRepo.manager.query(
      `
        WITH deleted AS (
          DELETE FROM llm_usage_events
          WHERE occurred_at < $1
          RETURNING id
        )
        SELECT COUNT(*)::text AS count FROM deleted
      `,
      [cutoff],
    );

    return Number(rows[0]?.count ?? 0);
  }
}

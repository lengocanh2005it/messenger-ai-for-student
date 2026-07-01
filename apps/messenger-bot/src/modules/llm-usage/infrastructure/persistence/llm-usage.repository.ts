import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmUsageEventEntity } from '../../../../infrastructure/database/entities/llm-usage-event.entity';
import type { LlmUsageRepositoryPort } from '../../domain/repositories/llm-usage.repository.port';
import type { RecordLlmUsageInput } from '../../domain/entities/llm-usage.types';
import type {
  LlmUsageAggregateRow,
  LlmUsageQueryFilter,
} from '../../domain/entities/llm-usage-summary.types';

interface AggregateQueryRow {
  feature: string;
  model: string;
  calls: string;
  prompt_tokens: string;
  completion_tokens: string;
  total_tokens: string;
  stored_cost_usd: string | null;
  unstored_prompt_tokens: string;
  unstored_completion_tokens: string;
}

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
          error_message,
          estimated_cost_usd
        )
        VALUES ($1::date, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
        input.estimatedCostUsd ?? null,
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

  async aggregateUsage(
    filter: LlmUsageQueryFilter,
  ): Promise<LlmUsageAggregateRow[]> {
    const { sql, params } = this.buildAggregateQuery(
      [
        'usage_date >= $1::date',
        'usage_date <= $2::date',
        ...this.buildIdentityFilters(filter, 3),
      ],
      [filter.fromDate, filter.toDate],
      filter,
    );

    const rows: AggregateQueryRow[] = await this.usageRepo.manager.query(
      sql,
      params,
    );

    return rows.map((row) => this.mapAggregateRow(row));
  }

  async aggregateFleetByDate(
    usageDate: string,
  ): Promise<LlmUsageAggregateRow[]> {
    const rows: AggregateQueryRow[] = await this.usageRepo.manager.query(
      this.buildAggregateSql(['usage_date = $1::date']),
      [usageDate],
    );

    return rows.map((row) => this.mapAggregateRow(row));
  }

  private buildIdentityFilters(
    filter: LlmUsageQueryFilter,
    startIndex: number,
  ): string[] {
    const clauses: string[] = [];
    let index = startIndex;

    if (filter.psid) {
      clauses.push(`psid = $${index}`);
      index += 1;
    }

    if (filter.userId !== undefined) {
      clauses.push(`user_id = $${index}`);
      index += 1;
    }

    return clauses;
  }

  private buildAggregateQuery(
    whereClauses: string[],
    baseParams: unknown[],
    filter: LlmUsageQueryFilter,
  ): { sql: string; params: unknown[] } {
    const params = [...baseParams];

    if (filter.psid) {
      params.push(filter.psid);
    }

    if (filter.userId !== undefined) {
      params.push(filter.userId);
    }

    return {
      sql: this.buildAggregateSql(whereClauses),
      params,
    };
  }

  private buildAggregateSql(whereClauses: string[]): string {
    return `
      SELECT
        feature,
        model,
        COUNT(*)::text AS calls,
        COALESCE(SUM(prompt_tokens), 0)::text AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::text AS completion_tokens,
        COALESCE(SUM(total_tokens), 0)::text AS total_tokens,
        SUM(estimated_cost_usd)::text AS stored_cost_usd,
        COALESCE(SUM(prompt_tokens) FILTER (WHERE estimated_cost_usd IS NULL), 0)::text AS unstored_prompt_tokens,
        COALESCE(SUM(completion_tokens) FILTER (WHERE estimated_cost_usd IS NULL), 0)::text AS unstored_completion_tokens
      FROM llm_usage_events
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY feature, model
      ORDER BY feature, model
    `;
  }

  private mapAggregateRow(row: AggregateQueryRow): LlmUsageAggregateRow {
    return {
      feature: row.feature,
      model: row.model,
      calls: Number(row.calls),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      totalTokens: Number(row.total_tokens),
      storedCostUsd: row.stored_cost_usd,
      unstoredPromptTokens: Number(row.unstored_prompt_tokens),
      unstoredCompletionTokens: Number(row.unstored_completion_tokens),
    };
  }
}

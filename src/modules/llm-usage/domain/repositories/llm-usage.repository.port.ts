import type { RecordLlmUsageInput } from '../entities/llm-usage.types';
import type {
  LlmUsageAggregateRow,
  LlmUsageQueryFilter,
} from '../entities/llm-usage-summary.types';

export const LLM_USAGE_REPOSITORY = Symbol('LLM_USAGE_REPOSITORY');

export interface LlmUsageRepositoryPort {
  insertUsage(
    input: RecordLlmUsageInput & { usageDate: string },
  ): Promise<void>;

  deleteOlderThan(cutoff: Date): Promise<number>;

  aggregateUsage(filter: LlmUsageQueryFilter): Promise<LlmUsageAggregateRow[]>;

  aggregateFleetByDate(usageDate: string): Promise<LlmUsageAggregateRow[]>;
}

import type { RecordLlmUsageInput } from '../entities/llm-usage.types';

export const LLM_USAGE_REPOSITORY = Symbol('LLM_USAGE_REPOSITORY');

export interface LlmUsageRepositoryPort {
  insertUsage(input: RecordLlmUsageInput & { usageDate: string }): Promise<void>;

  deleteOlderThan(cutoff: Date): Promise<number>;
}

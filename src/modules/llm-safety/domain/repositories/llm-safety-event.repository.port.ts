import type { InsertLlmSafetyEvent } from '../entities/llm-safety-event.types';

export const LLM_SAFETY_EVENT_REPOSITORY = Symbol(
  'LLM_SAFETY_EVENT_REPOSITORY',
);

export interface LlmSafetyEventRepositoryPort {
  insert(event: InsertLlmSafetyEvent): Promise<void>;
  countSince(since: Date): Promise<number>;
  deleteOlderThan(before: Date): Promise<number>;
}

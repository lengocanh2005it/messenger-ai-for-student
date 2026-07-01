import type { RecordLlmUsageInput } from './llm-usage.types';

export type LlmUsageWriteJobPayload = RecordLlmUsageInput & {
  usageDate: string;
};

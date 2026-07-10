export type LlmUsageFeature =
  | 'FREE_FORM_CHAT'
  | 'STUDENT_REPORT'
  | 'STUDY_REMINDER';

export type LlmUsageStatus = 'ok' | 'error';

export interface RecordLlmUsageInput {
  feature: LlmUsageFeature;
  psid?: string;
  userId?: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  openaiResponseId?: string;
  correlationId?: string;
  toolRound?: number;
  status?: LlmUsageStatus;
  errorMessage?: string;
  estimatedCostUsd?: string | null;
}

export interface LlmUsageAggregateRow {
  feature: string;
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  storedCostUsd: string | null;
  unstoredPromptTokens: number;
  unstoredCompletionTokens: number;
}

export interface LlmUsageQueryFilter {
  psid?: string;
  userId?: number;
  fromDate: string;
  toDate: string;
}

export interface LlmUsageFeatureSummary {
  feature: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: string | null;
}

export interface LlmUsageUserSummary {
  psid: string | null;
  userId: number | null;
  from: string;
  to: string;
  timezone: string;
  byFeature: LlmUsageFeatureSummary[];
  totals: Omit<LlmUsageFeatureSummary, 'feature'>;
  disclaimer: string;
}

export interface LlmUsageFleetSummary {
  date: string;
  timezone: string;
  byFeature: LlmUsageFeatureSummary[];
  totals: Omit<LlmUsageFeatureSummary, 'feature'>;
  disclaimer: string;
}

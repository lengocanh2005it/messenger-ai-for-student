export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmAgentConfig {
  /** @deprecated Use adapter.isConfigured() instead. Kept for backward compat. */
  apiKey?: string;
  model?: string;
  maxToolRounds?: number;
  maxContextChars?: number;
  /** TTL for tool result cache in ms. Default: 300_000 (5 min). 0 = disable cache. */
  toolCacheTtlMs?: number;
  /** Max LLM call retries on retryable errors. Default: 3. */
  maxLlmRetries?: number;
  /** Base delay for retry backoff in ms. Default: 100. */
  retryBaseDelayMs?: number;
}

export interface LlmAgentInput {
  /** Platform-specific user id (psid, discord user id, zalo uid...) — used for logging/telemetry only. */
  externalUserId: string;
  /** WISPACE userId if the external account is linked; undefined otherwise. */
  userId?: number;
  userText: string;
  /** Fully-built system prompt (base persona + per-user linkage note) — composed by the caller. */
  systemPrompt: string;
  history?: ChatHistoryMessage[];
  /** Correlation id (e.g. platform message id) for LLM usage telemetry. */
  correlationId?: string;
}

export interface LlmAgentReply {
  text: string;
  /** True when the agent exhausted maxToolRounds without reaching a final reply. */
  exhausted?: boolean;
}

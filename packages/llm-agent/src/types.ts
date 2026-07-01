export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmAgentConfig {
  apiKey?: string;
  model?: string;
  maxToolRounds?: number;
  maxContextChars?: number;
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
}

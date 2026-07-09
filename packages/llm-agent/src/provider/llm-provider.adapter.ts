import type {
  LlmJsonRequest,
  LlmJsonResponse,
  LlmToolChatRequest,
  LlmToolChatResponse,
  LlmStreamEvent,
  LlmProviderError,
} from './types';

/**
 * Provider-agnostic adapter interface. Each LLM provider (OpenAI, Anthropic,
 * Gemini, local, etc.) implements this interface. The harness (agentic loop,
 * report generation, reminder generation) only depends on this contract.
 */
export interface LlmProviderAdapter {
  /** Human-readable provider name for logging/metadata (e.g. 'openai'). */
  readonly providerName: string;

  /** Returns true when the adapter is properly configured (API key present, etc.). */
  isConfigured(): boolean;

  /** Returns the default model identifier for this provider. */
  getDefaultModel(): string;

  // -----------------------------------------------------------------------
  // Sync — single-shot JSON generation (report, reminder)
  // -----------------------------------------------------------------------
  generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse>;

  // -----------------------------------------------------------------------
  // Sync — full tool-calling response (one round)
  // -----------------------------------------------------------------------
  chatWithTools(request: LlmToolChatRequest): Promise<LlmToolChatResponse>;

  // -----------------------------------------------------------------------
  // Streaming — emits events as tokens arrive
  // -----------------------------------------------------------------------
  chatStream(request: LlmToolChatRequest): AsyncIterable<LlmStreamEvent>;

  // -----------------------------------------------------------------------
  // Error classification (provider-specific)
  // -----------------------------------------------------------------------
  isRetryableError(error: unknown): boolean;
  isRateLimitError(error: unknown): boolean;
  normalizeError(error: unknown): LlmProviderError;
}

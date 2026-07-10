export { LlmAgentService, LlmRetryExhaustedError } from './agent.service';
export type { LlmAgentPorts } from './agent.service';
export {
  AGENT_TOOLS,
  AGENT_TOOL_NAMES,
  SCORE_TOOLS,
  SCHEDULE_TOOLS,
  isAgentToolName,
  readPositiveLimit,
  readPastDays,
  readCalendarTimeRange,
  readPositiveInteger,
  readSchedulingMode,
  readOptionalString,
  readValidatedDate,
  readValidatedTime,
} from './agent.tools';
export type { AgentToolName } from './agent.tools';
export { NOOP_METRICS_PORT } from './ports';
export type {
  AgentMetricsPort,
  LlmExecutionPort,
  LlmRoundOutcome,
  LlmSafetyEventPort,
  LlmUsageRecorderPort,
  ToolExecutorPort,
} from './ports';
export type {
  ChatHistoryMessage,
  LlmAgentConfig,
  LlmAgentInput,
  LlmAgentReply,
} from './types';
export {
  buildPromptInjectionBlockedMessage,
  buildWispaceScopeRedirectMessage,
} from './messages';
export {
  detectPromptInjection,
  sanitizeToolResultContent,
  sanitizeUntrustedTextForLlm,
} from './utils/prompt-injection.utils';
export type { InjectionCheckResult } from './utils/prompt-injection.utils';
export { checkLlmGrounding } from './utils/llm-grounding.utils';
export type { LlmGroundingResult } from './utils/llm-grounding.utils';
export {
  isOpenAiRateLimitError,
  isOpenAiRetryableError,
  isOpenAiServerError,
} from './utils/openai-error.utils';
export { isObviouslyOffTopic } from './utils/scope.utils';
export { sanitizeReplyText } from './utils/text.utils';
export { loadSystemPromptFile } from './utils/load-system-prompt';

// --- Provider abstraction (new) ---
export type {
  LlmProvider,
  LlmFeature,
  LlmToolDefinition,
  LlmMessageRole,
  LlmToolCall,
  LlmMessage,
  LlmUsage,
  LlmProviderMetadata,
  LlmJsonRequest,
  LlmJsonResponse,
  LlmToolChatRequest,
  LlmToolChatResponse,
  LlmStreamEvent,
  LlmProviderError,
} from './provider/types';
export type { LlmProviderAdapter } from './provider/llm-provider.adapter';
export { OpenAiAdapter } from './provider/openai/openai-adapter';
export { OpenAiCompatibleAdapter } from './provider/openai-compatible/openai-compatible-adapter';
export { createLlmProviderAdapter } from './provider/factory';

// --- Tool result cache ---
export type { ToolResultCachePort } from './tool-cache/tool-result-cache.port';
export { NOOP_TOOL_RESULT_CACHE } from './tool-cache/tool-result-cache.port';
export { InMemoryToolResultCache } from './tool-cache/in-memory-tool-result-cache';

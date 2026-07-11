import type { LlmProviderAdapter } from './provider/llm-provider.adapter';
import type { LlmMessage } from './provider/types';
import type { ToolResultCachePort } from './tool-cache/tool-result-cache.port';
import { NOOP_TOOL_RESULT_CACHE } from './tool-cache/tool-result-cache.port';
import { AGENT_TOOLS } from './agent.tools';
import { checkLlmGrounding } from './utils/llm-grounding.utils';
import {
  detectPromptInjection,
  sanitizeToolResultContent,
} from './utils/prompt-injection.utils';
import { isObviouslyOffTopic } from './utils/scope.utils';
import { sanitizeReplyText } from './utils/text.utils';
import {
  buildPromptInjectionBlockedMessage,
  buildWispaceScopeRedirectMessage,
} from './messages';
import {
  AgentMetricsPort,
  LlmExecutionPort,
  LlmSafetyEventPort,
  LlmUsageRecorderPort,
  NOOP_METRICS_PORT,
  ToolExecutorPort,
} from './ports';
import type {
  ChatHistoryMessage,
  LlmAgentConfig,
  LlmAgentInput,
  LlmAgentReply,
  LlmAgentStreamEvent,
  LlmAgentExecuteCallbacks,
} from './types';

const DEFAULT_MAX_TOOL_ROUNDS = 6;
const DEFAULT_MAX_CONTEXT_CHARS = 24_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const FEATURE = 'FREE_FORM_CHAT';

// Injected after the platform system prompt to guide the model's reasoning.
const REASONING_INSTRUCTION = `
---
Trước khi trả lời, hãy:
1. Xác định ý định của học viên (tiến độ học, lịch học, đổi lịch, hay câu hỏi chung).
2. Nếu cần dữ liệu từ nhiều tool, hãy gọi tất cả trong cùng một lượt để tiết kiệm thời gian.
3. Chỉ trả lời bằng văn bản sau khi đã có đủ dữ liệu cần thiết.
`.trim();

export interface LlmAgentPorts<TToolContext> {
  llmExecution: LlmExecutionPort;
  usageRecorder: LlmUsageRecorderPort;
  safetyEvents: LlmSafetyEventPort;
  toolExecutor: ToolExecutorPort<TToolContext>;
  adapter: LlmProviderAdapter;
  toolResultCache?: ToolResultCachePort;
  metrics?: AgentMetricsPort;
  logger?: {
    warn: (message: string) => void;
    debug: (message: string) => void;
  };
}

const NOOP_LOGGER = { warn: () => undefined, debug: () => undefined };

/** djb2 hash — sufficient to distinguish different tool args. */
function stableHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(36);
}

const DEFAULT_TOOL_CACHE_TTL_MS = 300_000; // 5 minutes
const RESCHEDULE_TOOL = 'reschedule_study_session';
const CALENDAR_TOOL = 'list_study_calendar_entries';
const DEFAULT_MAX_LLM_RETRIES = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 100;
const MAX_RETRY_DELAY_MS = 10_000;

export class LlmRetryExhaustedError extends Error {
  constructor(
    public readonly attempts: number,
    cause: unknown,
  ) {
    super(`LLM call failed after ${attempts} attempts`);
    this.cause = cause;
  }
}

/**
 * Framework-agnostic LLM function-calling orchestration loop, shared across
 * all WISPACE bot platforms. Tool business logic (Wispace API calls, DB reads...)
 * is NOT part of this class — it lives behind `ToolExecutorPort`, implemented per app.
 *
 * The LLM provider is injected via `LlmProviderAdapter` — no direct SDK dependency.
 */
export class LlmAgentService<TToolContext> {
  constructor(
    private readonly config: LlmAgentConfig,
    private readonly ports: LlmAgentPorts<TToolContext>,
  ) {}

  async reply(
    input: LlmAgentInput,
    toolContext: TToolContext,
  ): Promise<LlmAgentReply> {
    const earlyReturn = this.checkEarlyReturns(input);
    if (earlyReturn) return earlyReturn.reply;

    const result = await this.execute(input, toolContext, {});
    if (!result) {
      throw new Error('LLM provider returned empty content');
    }
    return result.reply;
  }

  /**
   * Streaming variant of `reply()`. Tool-calling rounds run as normal (non-streaming)
   * because the full response is needed to dispatch tool calls. The final text round
   * yields `delta` events, enabling callers to show progressive output.
   *
   * Always ends with a single `done` event (or `error` on unrecoverable failure).
   */
  async *replyStream(
    input: LlmAgentInput,
    toolContext: TToolContext,
  ): AsyncIterable<LlmAgentStreamEvent> {
    const earlyReturn = this.checkEarlyReturns(input);
    if (earlyReturn) {
      yield { type: 'done', reply: earlyReturn.reply };
      return;
    }

    const state: {
      toolEvents: Array<{ type: 'tool_start'; toolName: string }>;
      reply?: LlmAgentReply;
      error?: Error;
    } = { toolEvents: [] };

    try {
      await this.execute(input, toolContext, {
        onToolStart: (toolName) => {
          state.toolEvents.push({ type: 'tool_start', toolName });
        },
        onReply: (reply) => {
          state.reply = reply;
        },
        onError: (error) => {
          state.error = error;
        },
      });

      // Yield accumulated tool_start events
      for (const evt of state.toolEvents) {
        yield evt;
      }

      if (state.error) {
        yield { type: 'error', error: state.error };
        return;
      }

      if (state.reply) {
        yield { type: 'delta', textDelta: state.reply.text };
        yield { type: 'done', reply: state.reply };
      }
    } catch (err) {
      yield { type: 'error', error: err };
    }
  }

  private buildFallbackReply(userText: string): string {
    const trimmed = userText.trim();
    if (!trimmed || isObviouslyOffTopic(trimmed)) {
      return buildWispaceScopeRedirectMessage();
    }

    return [
      'WISPACE đang bảo trì trợ lý AI tạm thời.',
      '',
      'Bạn có thể hỏi tự do về tiến độ, lịch học — WISPACE cũng gửi báo cáo và nhắc lịch tự động.',
    ].join('\n');
  }

  /**
   * Fix 2 — redact history entries containing injection patterns.
   * Fix 3 — truncate history to stay within context character budget.
   */
  private buildSafeHistory(
    history: ChatHistoryMessage[],
    systemPrompt: string,
    userText: string,
    externalUserId: string,
    logger: {
      warn: (message: string) => void;
      debug: (message: string) => void;
    },
  ): ChatHistoryMessage[] {
    const redacted = history.map((entry) => {
      const check = detectPromptInjection(entry.content);
      if (check.isInjection) {
        logger.warn(
          `History entry redacted externalUserId=${externalUserId} reason=${check.reason}`,
        );
        return { ...entry, content: '[redacted]' };
      }
      return entry;
    });

    const maxChars = this.getMaxContextChars();
    const fixedChars = systemPrompt.length + userText.length;
    let budget = maxChars - fixedChars;

    const result: ChatHistoryMessage[] = [];
    for (let i = redacted.length - 1; i >= 0; i--) {
      const entry = redacted[i];
      if (!entry) continue;
      if (budget >= entry.content.length) {
        result.unshift(entry);
        budget -= entry.content.length;
      } else {
        logger.debug(
          `History truncated at index ${i} to stay within context budget externalUserId=${externalUserId}`,
        );
        break;
      }
    }

    return result;
  }

  private getMaxContextChars(): number {
    return this.config.maxContextChars &&
      Number.isFinite(this.config.maxContextChars) &&
      this.config.maxContextChars > 0
      ? Math.floor(this.config.maxContextChars)
      : DEFAULT_MAX_CONTEXT_CHARS;
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    round: number,
    logger: { warn: (msg: string) => void },
  ): Promise<T> {
    const maxRetries = this.getMaxLlmRetries();
    const baseDelay = this.getRetryBaseDelayMs();
    let lastErr: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (
          !this.ports.adapter.isRetryableError(err) ||
          attempt === maxRetries
        ) {
          break;
        }
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() * 0.5),
          MAX_RETRY_DELAY_MS,
        );
        logger.warn(
          `LLM_RETRY attempt=${attempt + 1}/${maxRetries} round=${round} delay=${Math.round(delay)}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new LlmRetryExhaustedError(maxRetries + 1, lastErr);
  }

  private getMaxLlmRetries(): number {
    const v = this.config.maxLlmRetries;
    if (v && Number.isFinite(v) && v > 0) return Math.floor(v);
    return DEFAULT_MAX_LLM_RETRIES;
  }

  private getRetryBaseDelayMs(): number {
    const v = this.config.retryBaseDelayMs;
    if (v && Number.isFinite(v) && v > 0) return Math.floor(v);
    return DEFAULT_RETRY_BASE_DELAY_MS;
  }

  private getToolCacheTtlMs(): number {
    const v = this.config.toolCacheTtlMs;
    if (v === 0) return 0;
    if (v && Number.isFinite(v) && v > 0) return Math.floor(v);
    return DEFAULT_TOOL_CACHE_TTL_MS;
  }

  private getMaxToolRounds(): number {
    return this.config.maxToolRounds &&
      Number.isFinite(this.config.maxToolRounds) &&
      this.config.maxToolRounds > 0
      ? Math.floor(this.config.maxToolRounds)
      : DEFAULT_MAX_TOOL_ROUNDS;
  }

  private getMaxOutputTokens(): number {
    return this.config.maxOutputTokens &&
      Number.isFinite(this.config.maxOutputTokens) &&
      this.config.maxOutputTokens > 0
      ? Math.floor(this.config.maxOutputTokens)
      : DEFAULT_MAX_OUTPUT_TOKENS;
  }

  /** Detects the model repeating an identical tool call across rounds (stuck loop). */
  private buildToolCallSignature(
    toolCalls: Array<{ name: string; arguments: string }>,
  ): string {
    return toolCalls
      .map((tc) => `${tc.name}:${tc.arguments}`)
      .sort()
      .join('|');
  }

  // ─── Shared helpers ────────────────────────────────────────────────────

  private checkEarlyReturns(input: LlmAgentInput): {
    blocked: true;
    reply: LlmAgentReply;
  } | null {
    const logger = this.ports.logger ?? NOOP_LOGGER;
    const adapter = this.ports.adapter;

    if (!adapter.isConfigured()) {
      return {
        blocked: true,
        reply: { text: this.buildFallbackReply(input.userText) },
      };
    }

    const injectionCheck = detectPromptInjection(input.userText);
    if (injectionCheck.isInjection) {
      logger.warn(
        `Prompt injection blocked externalUserId=${input.externalUserId} reason=${injectionCheck.reason}`,
      );
      return {
        blocked: true,
        reply: { text: buildPromptInjectionBlockedMessage() },
      };
    }

    if (isObviouslyOffTopic(input.userText)) {
      return {
        blocked: true,
        reply: { text: buildWispaceScopeRedirectMessage() },
      };
    }

    return null;
  }

  private buildMessages(input: LlmAgentInput): LlmMessage[] {
    const logger = this.ports.logger ?? NOOP_LOGGER;
    const safeHistory = this.buildSafeHistory(
      input.history ?? [],
      input.systemPrompt,
      input.userText,
      input.externalUserId,
      logger,
    );

    return [
      {
        role: 'system',
        content: `${input.systemPrompt}\n\n${REASONING_INSTRUCTION}`,
      },
      ...safeHistory.map((entry) => ({
        role:
          entry.role === 'tool_summary' ? ('assistant' as const) : entry.role,
        content: entry.content,
      })),
      { role: 'user', content: input.userText.trim() },
    ];
  }

  // ─── Core orchestration loop ───────────────────────────────────────────

  /**
   * Shared tool-calling loop for `reply()` and `replyStream()`.
   *
   * - `onToolStart(toolName)` is called synchronously before each tool batch executes.
   * - `onReply(reply)` is called with the final reply on success.
   * - `onError(error)` is called on unrecoverable errors (empty content, retry exhaustion).
   *
   * Returns `{ reply, toolEvents }` on success, or `null` on error (error delivered via callback).
   * Throws `LlmRetryExhaustedError` when retries are exhausted **and** no `onError` is provided.
   */
  private async execute(
    input: LlmAgentInput,
    toolContext: TToolContext,
    callbacks: LlmAgentExecuteCallbacks,
  ): Promise<{
    reply: LlmAgentReply;
    toolEvents: Array<{ type: 'tool_start'; toolName: string }>;
  } | null> {
    const logger = this.ports.logger ?? NOOP_LOGGER;
    const metrics = this.ports.metrics ?? NOOP_METRICS_PORT;
    const adapter = this.ports.adapter;

    const model = adapter.getDefaultModel();
    const messages = this.buildMessages(input);

    const toolsCalledThisTurn = new Set<string>();
    const toolEvents: Array<{ type: 'tool_start'; toolName: string }> = [];
    const maxToolRounds = this.getMaxToolRounds();
    let previousToolCallSignature: string | null = null;

    for (let round = 0; round < maxToolRounds; round++) {
      const response = await metrics.timeLlmCall(FEATURE, model, round, () =>
        this.ports.llmExecution.run(
          () =>
            this.withRetry(
              () =>
                adapter.chatWithTools({
                  feature: FEATURE,
                  model,
                  messages,
                  tools: AGENT_TOOLS,
                  toolChoice: 'auto',
                  correlationId: input.correlationId,
                  maxOutputTokens: this.getMaxOutputTokens(),
                }),
              round,
              logger,
            ),
          { feature: FEATURE, correlationId: input.correlationId },
        ),
      );

      this.ports.usageRecorder.recordFromCompletion({
        feature: FEATURE,
        externalUserId: input.externalUserId,
        userId: input.userId,
        model,
        response: {
          id: response.metadata.responseId ?? '',
          usage: response.metadata.usage
            ? {
                prompt_tokens: response.metadata.usage.promptTokens,
                completion_tokens: response.metadata.usage.completionTokens,
                total_tokens: response.metadata.usage.totalTokens,
                prompt_tokens_details:
                  response.metadata.usage.cachedTokens !== undefined
                    ? { cached_tokens: response.metadata.usage.cachedTokens }
                    : undefined,
              }
            : null,
        },
        correlationId: input.correlationId,
        toolRound: round,
      });

      const toolCalls = response.message.toolCalls;

      if (!toolCalls?.length) {
        metrics.llmRoundOutcomeInc(FEATURE, 'direct_reply');

        const text = response.content;
        if (!text) {
          const error = new Error('LLM provider returned empty content');
          callbacks.onError?.(error);
          if (!callbacks.onError) throw error;
          return null;
        }

        const groundingCheck = checkLlmGrounding(text, toolsCalledThisTurn);
        if (groundingCheck.suspicious) {
          logger.warn(
            `LLM_GROUNDING_WARNING feature=${FEATURE} externalUserId=${input.externalUserId} reason=${groundingCheck.reason} tools_called=${[...toolsCalledThisTurn].join(',') || 'none'}`,
          );
          this.ports.safetyEvents.recordGroundingWarning({
            externalUserId: input.externalUserId,
            userId: input.userId,
            correlationId: input.correlationId,
            reason: groundingCheck.reason ?? 'unknown',
            userTextPreview: input.userText,
            assistantTextPreview: text,
            toolNamesUsed: [...toolsCalledThisTurn],
          });
        }

        const toolSummary =
          toolsCalledThisTurn.size > 0
            ? `[Đã tra cứu: ${[...toolsCalledThisTurn].join('; ')}]`
            : undefined;
        const reply: LlmAgentReply = {
          text: sanitizeReplyText(text),
          toolSummary,
        };
        callbacks.onReply?.(reply);
        return { reply, toolEvents };
      }

      const signature = this.buildToolCallSignature(toolCalls);
      if (signature === previousToolCallSignature) {
        metrics.llmRoundOutcomeInc(FEATURE, 'duplicate_tool_calls');
        logger.warn(
          `LLM agent detected duplicate tool calls, stopping early round=${round} externalUserId=${input.externalUserId} tools_called=${[...toolsCalledThisTurn].join(',') || 'none'}`,
        );
        break;
      }
      previousToolCallSignature = signature;

      metrics.llmRoundOutcomeInc(FEATURE, 'tool_call');
      messages.push(response.message);

      // Notify caller of tool_start events before execution
      for (const tc of toolCalls) {
        const evt = { type: 'tool_start' as const, toolName: tc.name };
        toolEvents.push(evt);
        callbacks.onToolStart?.(tc.name);
      }

      const toolResults = await this.executeToolCalls(
        toolCalls,
        input,
        toolContext,
        toolsCalledThisTurn,
      );

      for (const { toolCallId, content } of toolResults) {
        messages.push({ role: 'tool', toolCallId, content });
      }
    }

    // Exhausted all rounds — return graceful reply (same as before refactor)
    metrics.llmRoundOutcomeInc(FEATURE, 'exhausted');
    logger.warn(
      `LLM agent exhausted maxToolRounds=${this.getMaxToolRounds()} externalUserId=${input.externalUserId} tools_called=${[...toolsCalledThisTurn].join(',') || 'none'}`,
    );
    const toolList = [...toolsCalledThisTurn].join(', ') || 'không có';
    const toolSummary =
      toolsCalledThisTurn.size > 0
        ? `[Đã tra cứu: ${[...toolsCalledThisTurn].join('; ')}]`
        : undefined;
    const reply: LlmAgentReply = {
      text: `Trợ lý đã tra cứu thông tin (${toolList}) nhưng chưa thể tổng hợp kết quả. Bạn vui lòng thử lại hoặc đặt câu hỏi cụ thể hơn nhé.`,
      exhausted: true,
      toolSummary,
    };
    callbacks.onReply?.(reply);
    return { reply, toolEvents };
  }

  private async executeToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
    input: LlmAgentInput,
    toolContext: TToolContext,
    toolsCalledThisTurn: Set<string>,
  ): Promise<Array<{ toolCallId: string; content: string }>> {
    const logger = this.ports.logger ?? NOOP_LOGGER;
    const metrics = this.ports.metrics ?? NOOP_METRICS_PORT;
    const cache = this.ports.toolResultCache ?? NOOP_TOOL_RESULT_CACHE;
    const cacheTtlMs = this.getToolCacheTtlMs();

    return Promise.all(
      toolCalls.map(async (toolCall) => {
        const toolName = toolCall.name;
        toolsCalledThisTurn.add(toolName);
        const argsJson = toolCall.arguments || '{}';
        const cacheKey = `${input.externalUserId}:${toolName}:${stableHash(argsJson)}`;

        let content: string;
        try {
          const cached = cacheTtlMs > 0 ? cache.get(cacheKey) : undefined;
          let result: unknown;
          if (cached !== undefined) {
            logger.debug(
              `Tool cache hit externalUserId=${input.externalUserId} tool=${toolName}`,
            );
            result = cached;
          } else {
            result = await metrics.timeTool(toolName, () =>
              this.ports.toolExecutor.execute(toolName, argsJson, toolContext),
            );
            if (cacheTtlMs > 0) {
              cache.set(cacheKey, result, cacheTtlMs);
              if (toolName === RESCHEDULE_TOOL) {
                cache.invalidatePrefix(
                  `${input.externalUserId}:${CALENDAR_TOOL}:`,
                );
                logger.debug(
                  `Cache invalidated ${CALENDAR_TOOL} for externalUserId=${input.externalUserId} after reschedule`,
                );
              }
            }
          }
          const raw = JSON.stringify({ ok: true, data: result });
          const sanitized = sanitizeToolResultContent(raw);
          if (sanitized.wasSanitized) {
            logger.warn(
              `Tool result sanitized externalUserId=${input.externalUserId} tool=${toolName} reason=${sanitized.reason}`,
            );
          }
          content = sanitized.content;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown error';
          logger.warn(
            `Tool execution failed externalUserId=${input.externalUserId} tool=${toolName} error=${message}`,
          );
          content = JSON.stringify({ ok: false, error: message });
        }

        return { toolCallId: toolCall.id, content };
      }),
    );
  }
}

import type { LlmProviderAdapter } from './provider/llm-provider.adapter';
import type { LlmMessage } from './provider/types';
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
} from './types';

const DEFAULT_MAX_TOOL_ROUNDS = 6;
const DEFAULT_MAX_CONTEXT_CHARS = 24_000;
const FEATURE = 'FREE_FORM_CHAT';

export interface LlmAgentPorts<TToolContext> {
  llmExecution: LlmExecutionPort;
  usageRecorder: LlmUsageRecorderPort;
  safetyEvents: LlmSafetyEventPort;
  toolExecutor: ToolExecutorPort<TToolContext>;
  adapter: LlmProviderAdapter;
  metrics?: AgentMetricsPort;
  logger?: {
    warn: (message: string) => void;
    debug: (message: string) => void;
  };
}

const NOOP_LOGGER = { warn: () => undefined, debug: () => undefined };

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
    const logger = this.ports.logger ?? NOOP_LOGGER;
    const metrics = this.ports.metrics ?? NOOP_METRICS_PORT;
    const adapter = this.ports.adapter;

    if (!adapter.isConfigured()) {
      logger.warn('LLM provider missing, using fallback chat reply');
      return { text: this.buildFallbackReply(input.userText) };
    }

    const injectionCheck = detectPromptInjection(input.userText);
    if (injectionCheck.isInjection) {
      logger.warn(
        `Prompt injection blocked externalUserId=${input.externalUserId} reason=${injectionCheck.reason}`,
      );
      return { text: buildPromptInjectionBlockedMessage() };
    }

    if (isObviouslyOffTopic(input.userText)) {
      return { text: buildWispaceScopeRedirectMessage() };
    }

    const model = adapter.getDefaultModel();
    const safeHistory = this.buildSafeHistory(
      input.history ?? [],
      input.systemPrompt,
      input.userText,
      input.externalUserId,
      logger,
    );

    const messages: LlmMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...safeHistory.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: 'user', content: input.userText.trim() },
    ];

    const toolsCalledThisTurn = new Set<string>();
    const maxToolRounds = this.getMaxToolRounds();

    for (let round = 0; round < maxToolRounds; round++) {
      const response = await metrics.timeLlmCall(FEATURE, model, round, () =>
        this.ports.llmExecution.run(
          () =>
            adapter.chatWithTools({
              feature: FEATURE,
              model,
              messages,
              tools: AGENT_TOOLS,
              toolChoice: 'auto',
              correlationId: input.correlationId,
            }),
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
          throw new Error('LLM provider returned empty content');
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

        return { text: sanitizeReplyText(text) };
      }

      metrics.llmRoundOutcomeInc(FEATURE, 'tool_call');

      // Push the assistant message (with tool calls) for the next round
      messages.push(response.message);

      for (const toolCall of toolCalls) {
        const toolName = toolCall.name;
        toolsCalledThisTurn.add(toolName);

        const result = await metrics.timeTool(toolName, () =>
          this.ports.toolExecutor.execute(
            toolName,
            toolCall.arguments || '{}',
            toolContext,
          ),
        );

        const raw = JSON.stringify(result);
        const sanitized = sanitizeToolResultContent(raw);
        if (sanitized.wasSanitized) {
          logger.warn(
            `Tool result sanitized externalUserId=${input.externalUserId} tool=${toolName} reason=${sanitized.reason}`,
          );
        }

        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: sanitized.content,
        });
      }
    }

    metrics.llmRoundOutcomeInc(FEATURE, 'exhausted');
    throw new Error('LLM agent exceeded maximum tool rounds');
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

  private getMaxToolRounds(): number {
    return this.config.maxToolRounds &&
      Number.isFinite(this.config.maxToolRounds) &&
      this.config.maxToolRounds > 0
      ? Math.floor(this.config.maxToolRounds)
      : DEFAULT_MAX_TOOL_ROUNDS;
  }
}

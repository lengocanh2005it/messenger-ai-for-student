import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import { loadSystemPrompt } from '../../../../shared/prompts/load-system-prompt';
import { sanitizeMessengerText } from '../../../../shared/utils/messenger-text.utils';
import { UserDisplayNameService } from '../../../study-reminder/application/services/user-display-name.service';
import {
  MessengerAgentToolsService,
  MessengerAgentToolContext,
} from './messenger-agent-tools.service';
import type { ChatHistoryMessage } from '../services/messenger-chat-history.service';
import type { MessengerRichFollowUp } from '../../domain/entities/messenger-rich-message.types';
import { isObviouslyOffTopic } from '../../../../shared/utils/messenger-scope.utils';
import {
  detectPromptInjection,
  sanitizeToolResultContent,
} from '../../../../shared/utils/prompt-injection.utils';
import { checkLlmGrounding } from '../../../../shared/utils/llm-grounding.utils';
import { LlmSafetyEventService } from '../../../llm-safety/application/services/llm-safety-event.service';
import {
  buildPromptInjectionBlockedMessage,
  buildWispaceScopeRedirectMessage,
} from '../messages/wispace-scope.messages';
import { LlmExecutionService } from '../../../llm-execution/application/services/llm-execution.service';
import { LlmUsageRecorderService } from '../../../llm-usage/application/services/llm-usage-recorder.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { MESSENGER_AGENT_TOOLS } from './messenger-agent.tools';

export interface MessengerAgentReply {
  text: string;
  richFollowUps: MessengerRichFollowUp[];
}

export interface MessengerAgentInput {
  psid: string;
  userId?: number;
  userText: string;
  linkContext?: MessengerLinkContext;
  history?: ChatHistoryMessage[];
  /** message.mid — LLM usage correlation id */
  correlationId?: string;
}

@Injectable()
export class MessengerAgentService {
  private readonly logger = new Logger(MessengerAgentService.name);
  private openai: OpenAI | null = null;
  private static readonly DEFAULT_MAX_TOOL_ROUNDS = 6;
  private static readonly DEFAULT_MAX_CONTEXT_CHARS = 24_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsService: MessengerAgentToolsService,
    private readonly userDisplayNameService: UserDisplayNameService,
    private readonly llmUsageRecorder: LlmUsageRecorderService,
    private readonly llmExecution: LlmExecutionService,
    private readonly llmSafetyEventService: LlmSafetyEventService,
    private readonly metrics: MetricsService,
  ) {}

  async reply(input: MessengerAgentInput): Promise<MessengerAgentReply> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY missing, using fallback chat reply');
      return {
        text: this.buildFallbackReply(input.userText),
        richFollowUps: [],
      };
    }

    const injectionCheck = detectPromptInjection(input.userText);
    if (injectionCheck.isInjection) {
      this.logger.warn(
        `Prompt injection blocked psid=${input.psid} reason=${injectionCheck.reason}`,
      );
      return {
        text: buildPromptInjectionBlockedMessage(),
        richFollowUps: [],
      };
    }

    const displayName = await this.userDisplayNameService.resolveDisplayName({
      psid: input.psid,
      userId: input.userId,
    });

    const toolContext: MessengerAgentToolContext = {
      psid: input.psid,
      userId: input.userId,
      linkContext: input.linkContext,
      richFollowUps: [],
    };

    const fastReschedule = await this.toolsService.tryFastDefaultReschedule(
      toolContext,
      input.userText,
    );
    if (fastReschedule) {
      return fastReschedule;
    }

    if (isObviouslyOffTopic(input.userText)) {
      return {
        text: buildWispaceScopeRedirectMessage(),
        richFollowUps: [],
      };
    }

    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.4';
    const client = this.getOpenAiClient(apiKey);
    const systemPrompt = this.buildSystemPrompt(displayName, input.userId);
    const safeHistory = this.buildSafeHistory(
      input.history ?? [],
      systemPrompt,
      input.userText,
      input.psid,
    );
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...safeHistory.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: 'user', content: input.userText.trim() },
    ];

    const toolsCalledThisTurn = new Set<string>();

    for (let round = 0; round < this.getMaxToolRounds(); round++) {
      const response = await this.metrics.timeLlmCall(
        'FREE_FORM_CHAT',
        model,
        round,
        () =>
          this.llmExecution.run(
            () =>
              client.chat.completions.create({
                model,
                messages,
                tools: MESSENGER_AGENT_TOOLS,
                tool_choice: 'auto',
              }),
            {
              feature: 'FREE_FORM_CHAT',
              correlationId: input.correlationId,
            },
          ),
      );

      this.llmUsageRecorder.recordFromCompletion({
        feature: 'FREE_FORM_CHAT',
        psid: input.psid,
        userId: input.userId,
        model,
        response,
        correlationId: input.correlationId,
        toolRound: round,
      });

      const choice = response.choices[0]?.message;
      if (!choice) {
        throw new Error('OpenAI returned empty assistant message');
      }

      messages.push(choice);

      const toolCalls = choice.tool_calls;
      if (!toolCalls?.length) {
        // LLM decided to reply directly — no more tool rounds
        this.metrics.llmRoundOutcome.inc({
          feature: 'FREE_FORM_CHAT',
          outcome: 'direct_reply',
        });

        const text = choice.content?.trim();
        if (!text) {
          throw new Error('OpenAI returned empty content');
        }

        const groundingCheck = checkLlmGrounding(text, toolsCalledThisTurn);
        if (groundingCheck.suspicious) {
          this.logger.warn(
            `LLM_GROUNDING_WARNING feature=FREE_FORM_CHAT psid=${input.psid} reason=${groundingCheck.reason} tools_called=${[...toolsCalledThisTurn].join(',') || 'none'}`,
          );
          this.llmSafetyEventService.recordGroundingWarning({
            psid: input.psid,
            userId: input.userId,
            correlationId: input.correlationId,
            reason: groundingCheck.reason ?? 'unknown',
            userTextPreview: input.userText,
            assistantTextPreview: text,
            toolNamesUsed: [...toolsCalledThisTurn],
          });
        }

        return {
          text: sanitizeMessengerText(text),
          richFollowUps: toolContext.richFollowUps,
        };
      }

      // LLM requested tool calls — execute each and feed results back
      this.metrics.llmRoundOutcome.inc({
        feature: 'FREE_FORM_CHAT',
        outcome: 'tool_call',
      });

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') {
          continue;
        }

        const toolName = toolCall.function.name;
        toolsCalledThisTurn.add(toolName);

        const result = await this.metrics.timeTool(toolName, () =>
          this.toolsService.execute(
            toolName,
            toolCall.function.arguments ?? '{}',
            toolContext,
          ),
        );

        const raw = JSON.stringify(result);
        const sanitized = sanitizeToolResultContent(raw);
        if (sanitized.wasSanitized) {
          this.logger.warn(
            `Tool result sanitized psid=${input.psid} tool=${toolName} reason=${sanitized.reason}`,
          );
        }

        const toolMessage: ChatCompletionToolMessageParam = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: sanitized.content,
        };
        messages.push(toolMessage);
      }
    }

    this.metrics.llmRoundOutcome.inc({
      feature: 'FREE_FORM_CHAT',
      outcome: 'exhausted',
    });
    throw new Error('Messenger agent exceeded maximum tool rounds');
  }

  private buildSystemPrompt(displayName: string, userId?: number): string {
    const base = loadSystemPrompt('messengerChat');
    const linkage = userId
      ? `Học viên đã liên kết WISPACE (userId=${userId}). Tên gọi: ${displayName}.`
      : `Học viên chưa liên kết WISPACE. Tên gọi: ${displayName}. Nhắc mở Messenger từ link trong app WISPACE nếu cần dữ liệu cá nhân.`;

    return `${base}\n\n${linkage}`;
  }

  private buildFallbackReply(userText: string): string {
    const trimmed = userText.trim();
    if (!trimmed || isObviouslyOffTopic(trimmed)) {
      return buildWispaceScopeRedirectMessage();
    }

    return [
      'WISPACE đang bảo trì trợ lý AI tạm thời.',
      '',
      'Bạn có thể hỏi tự do về tiến độ, lịch học — WISPACE cũng gửi báo cáo và nhắc lịch tự động. Menu: «Đăng ký báo cáo».',
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
    psid: string,
  ): ChatHistoryMessage[] {
    // Redact any history message that contains injection patterns
    const redacted = history.map((entry) => {
      const check = detectPromptInjection(entry.content);
      if (check.isInjection) {
        this.logger.warn(
          `History entry redacted psid=${psid} reason=${check.reason}`,
        );
        return { ...entry, content: '[redacted]' };
      }
      return entry;
    });

    // Truncate oldest messages if total context would exceed budget
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
        this.logger.debug(
          `History truncated at index ${i} to stay within context budget psid=${psid}`,
        );
        break;
      }
    }

    return result;
  }

  private getMaxContextChars(): number {
    const raw = this.configService.get<string>('OPENAI_MAX_CONTEXT_CHARS');
    const value = Number(raw);
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : MessengerAgentService.DEFAULT_MAX_CONTEXT_CHARS;
  }

  private getMaxToolRounds(): number {
    const raw = this.configService.get<string>('OPENAI_MAX_TOOL_ROUNDS');
    const value = Number(raw);
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : MessengerAgentService.DEFAULT_MAX_TOOL_ROUNDS;
  }

  private getOpenAiClient(apiKey: string): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }
}

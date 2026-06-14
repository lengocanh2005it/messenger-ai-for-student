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
import { buildWispaceScopeRedirectMessage } from '../messages/wispace-scope.messages';
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
}

@Injectable()
export class MessengerAgentService {
  private readonly logger = new Logger(MessengerAgentService.name);
  private openai: OpenAI | null = null;
  private static readonly MAX_TOOL_ROUNDS = 6;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsService: MessengerAgentToolsService,
    private readonly userDisplayNameService: UserDisplayNameService,
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
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(displayName, input.userId),
      },
      ...(input.history ?? []).map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      {
        role: 'user',
        content: input.userText.trim(),
      },
    ];

    for (
      let round = 0;
      round < MessengerAgentService.MAX_TOOL_ROUNDS;
      round++
    ) {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools: MESSENGER_AGENT_TOOLS,
        tool_choice: 'auto',
      });

      const choice = response.choices[0]?.message;
      if (!choice) {
        throw new Error('OpenAI returned empty assistant message');
      }

      messages.push(choice);

      const toolCalls = choice.tool_calls;
      if (!toolCalls?.length) {
        const text = choice.content?.trim();
        if (!text) {
          throw new Error('OpenAI returned empty content');
        }
        return {
          text: sanitizeMessengerText(text),
          richFollowUps: toolContext.richFollowUps,
        };
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type !== 'function') {
          continue;
        }

        const result = await this.toolsService.execute(
          toolCall.function.name,
          toolCall.function.arguments ?? '{}',
          toolContext,
        );

        const toolMessage: ChatCompletionToolMessageParam = {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        };
        messages.push(toolMessage);
      }
    }

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

  private getOpenAiClient(apiKey: string): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }
}

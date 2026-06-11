import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import {
  mergeChatUserTexts,
  splitMessengerBubbles,
} from '../../../../shared/utils/messenger-text.utils';
import { MessengerAgentService } from '../agent/messenger-agent.service';
import { MessengerChatHistoryService } from './messenger-chat-history.service';
import { MessengerOutboundService } from './messenger-outbound.service';

export interface EnqueueChatMessageInput {
  psid: string;
  userId?: number;
  userText: string;
  linkContext?: MessengerLinkContext;
}

interface PsidChatQueueState {
  texts: string[];
  userId?: number;
  linkContext?: MessengerLinkContext;
  debounceTimer?: ReturnType<typeof setTimeout>;
  processing: boolean;
  pendingWhileProcessing: string[];
}

@Injectable()
export class MessengerChatQueueService {
  private readonly logger = new Logger(MessengerChatQueueService.name);
  private readonly queues = new Map<string, PsidChatQueueState>();

  constructor(
    private readonly configService: ConfigService,
    private readonly outbound: MessengerOutboundService,
    private readonly messengerAgentService: MessengerAgentService,
    private readonly chatHistory: MessengerChatHistoryService,
  ) {}

  enqueue(input: EnqueueChatMessageInput): void {
    const text = input.userText.trim();
    if (!text) {
      return;
    }

    void this.outbound.sendSenderAction(input.psid, 'mark_seen');

    let state = this.queues.get(input.psid);
    if (!state) {
      state = {
        texts: [],
        processing: false,
        pendingWhileProcessing: [],
      };
      this.queues.set(input.psid, state);
    }

    state.userId = input.userId ?? state.userId;
    state.linkContext = input.linkContext ?? state.linkContext;

    if (state.processing) {
      state.pendingWhileProcessing.push(text);
      this.logger.log(
        `Queued chat while processing psid=${input.psid} (pending=${state.pendingWhileProcessing.length})`,
      );
      return;
    }

    state.texts.push(text);
    this.scheduleFlush(input.psid, state);
  }

  private scheduleFlush(psid: string, state: PsidChatQueueState): void {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
      void this.flush(psid);
    }, this.getDebounceMs());
  }

  private async flush(psid: string): Promise<void> {
    const state = this.queues.get(psid);
    if (!state || state.processing || !state.texts.length) {
      return;
    }

    state.processing = true;
    const mergedText = mergeChatUserTexts(state.texts);
    state.texts = [];
    const { userId, linkContext } = state;

    try {
      await this.outbound.sendSenderAction(psid, 'typing_on');

      const reply = await this.messengerAgentService.reply({
        psid,
        userId,
        userText: mergedText,
        linkContext,
        history: this.chatHistory.getHistory(psid),
      });

      if (reply.text.trim()) {
        this.chatHistory.appendTurn(psid, mergedText, reply.text);
        await this.outbound.sendTextBubblesViaPsid({
          psid,
          userId,
          text: reply.text,
          messageType: 'FREE_FORM_CHAT_OUT',
          maxBubbles: this.getMaxBubbles(),
          maxCharsPerBubble: this.getMaxCharsPerBubble(),
        });
      }

      if (reply.richFollowUps.length > 0) {
        await this.outbound.sendRichFollowUps({
          psid,
          userId,
          followUps: reply.richFollowUps,
        });
      }
    } catch (error) {
      this.logger.error(
        `Chat queue failed for psid=${psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      try {
        await this.outbound.sendTextViaPsid({
          psid,
          userId,
          text: 'Xin lỗi, mình chưa xử lý được tin nhắn. Bạn thử gửi lại sau giây lát nhé.',
          messageType: 'FREE_FORM_CHAT_ERROR',
        });
      } catch (sendError) {
        this.logger.error(
          `Failed to send chat error fallback psid=${psid}: ${
            sendError instanceof Error ? sendError.message : String(sendError)
          }`,
        );
      }
    } finally {
      state.processing = false;

      if (state.pendingWhileProcessing.length > 0) {
        state.texts.push(...state.pendingWhileProcessing);
        state.pendingWhileProcessing = [];
      }

      if (state.texts.length > 0) {
        this.scheduleFlush(psid, state);
      } else if (
        !state.debounceTimer &&
        state.pendingWhileProcessing.length === 0
      ) {
        this.queues.delete(psid);
      }
    }
  }

  private getDebounceMs(): number {
    const parsed = Number(
      this.configService.get<string>('CHAT_DEBOUNCE_MS') ?? 2000,
    );
    if (!Number.isFinite(parsed) || parsed < 0) {
      return 2000;
    }

    return Math.min(Math.floor(parsed), 10_000);
  }

  private getMaxBubbles(): number {
    const parsed = Number(
      this.configService.get<string>('CHAT_MAX_BUBBLES') ?? 4,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 4;
    }

    return Math.min(Math.floor(parsed), 10);
  }

  private getMaxCharsPerBubble(): number {
    const parsed = Number(
      this.configService.get<string>('CHAT_BUBBLE_MAX_CHARS') ?? 640,
    );
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 640;
    }

    return Math.min(Math.floor(parsed), 2000);
  }
}

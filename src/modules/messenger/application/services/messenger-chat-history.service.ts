import { Inject, Injectable, Optional } from '@nestjs/common';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import type { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatHistoryState {
  messages: ChatHistoryMessage[];
  updatedAt: number;
}

@Injectable()
export class MessengerChatHistoryService {
  private static readonly MAX_MESSAGES = 12;
  private static readonly TTL_MS = 30 * 60 * 1000;

  private readonly store = new Map<string, ChatHistoryState>();

  constructor(
    @Optional()
    private readonly sharedConfig?: MessengerChatSharedConfigService,
    @Optional()
    @Inject(MESSENGER_CHAT_SHARED_STATE_REPOSITORY)
    private readonly sharedState?: MessengerChatSharedStateRepositoryPort,
  ) {}

  async getHistory(psid: string): Promise<ChatHistoryMessage[]> {
    if (this.isShared()) {
      return this.sharedState!.getChatHistory(
        psid,
        this.sharedConfig!.getHistoryTtlMs(),
      );
    }

    this.evictStale();

    const state = this.store.get(psid);
    if (!state) {
      return [];
    }

    if (Date.now() - state.updatedAt > MessengerChatHistoryService.TTL_MS) {
      this.store.delete(psid);
      return [];
    }

    return [...state.messages];
  }

  async appendTurn(
    psid: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    const user = userText.trim();
    const assistant = assistantText.trim();
    if (!user || !assistant) {
      return;
    }

    if (this.isShared()) {
      await this.sharedState!.appendChatHistoryTurn(
        psid,
        user,
        assistant,
        this.sharedConfig!.getHistoryMaxMessages(),
      );
      return;
    }

    const existing = await this.getHistory(psid);
    const messages = [
      ...existing,
      { role: 'user' as const, content: user },
      { role: 'assistant' as const, content: assistant },
    ].slice(-MessengerChatHistoryService.MAX_MESSAGES);

    this.store.set(psid, {
      messages,
      updatedAt: Date.now(),
    });
  }

  async clear(psid: string): Promise<void> {
    if (this.isShared()) {
      await this.sharedState!.clearChatHistory(psid);
      return;
    }

    this.store.delete(psid);
  }

  private isShared(): boolean {
    return this.sharedConfig?.isSharedQueueEnabled() === true;
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [psid, state] of this.store) {
      if (now - state.updatedAt > MessengerChatHistoryService.TTL_MS) {
        this.store.delete(psid);
      }
    }
  }
}

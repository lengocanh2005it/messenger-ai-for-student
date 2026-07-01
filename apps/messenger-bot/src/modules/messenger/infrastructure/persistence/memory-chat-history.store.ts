import { Injectable } from '@nestjs/common';
import type { ChatHistoryMessage } from '../../domain/entities/chat-history.types';
import type { ChatHistoryStorePort } from '../../domain/repositories/chat-history.store.port';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';

interface ChatHistoryState {
  messages: ChatHistoryMessage[];
  updatedAt: number;
}

@Injectable()
export class MemoryChatHistoryStore implements ChatHistoryStorePort {
  private readonly store = new Map<string, ChatHistoryState>();

  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
  ) {}

  getHistory(psid: string): Promise<ChatHistoryMessage[]> {
    this.evictStale();

    const state = this.store.get(psid);
    if (!state) {
      return Promise.resolve([]);
    }

    if (Date.now() - state.updatedAt > this.sharedConfig.getHistoryTtlMs()) {
      this.store.delete(psid);
      return Promise.resolve([]);
    }

    return Promise.resolve([...state.messages]);
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

    const existing = await this.getHistory(psid);
    const messages = [
      ...existing,
      { role: 'user' as const, content: user },
      { role: 'assistant' as const, content: assistant },
    ].slice(-this.sharedConfig.getHistoryMaxMessages());

    this.store.set(psid, {
      messages,
      updatedAt: Date.now(),
    });
  }

  clear(psid: string): Promise<void> {
    this.store.delete(psid);
    return Promise.resolve();
  }

  private evictStale(): void {
    const ttlMs = this.sharedConfig.getHistoryTtlMs();
    const now = Date.now();

    for (const [psid, state] of this.store) {
      if (now - state.updatedAt > ttlMs) {
        this.store.delete(psid);
      }
    }
  }
}

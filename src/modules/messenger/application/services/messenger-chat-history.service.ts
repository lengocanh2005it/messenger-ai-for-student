import { Injectable } from '@nestjs/common';

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

  getHistory(psid: string): ChatHistoryMessage[] {
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

  appendTurn(psid: string, userText: string, assistantText: string): void {
    const user = userText.trim();
    const assistant = assistantText.trim();
    if (!user || !assistant) {
      return;
    }

    const existing = this.getHistory(psid);
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

  clear(psid: string): void {
    this.store.delete(psid);
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

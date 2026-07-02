import type { ChatHistoryMessage } from './types';
import type { ChatHistoryStorePort } from './ports';

export interface MemoryChatHistoryStoreConfig {
  /** Idle-eviction window; a user with no turns for this long is dropped. */
  ttlMs: number;
  /** Max stored messages per user (2 per turn: user + assistant). */
  maxMessages: number;
}

interface ChatHistoryState {
  messages: ChatHistoryMessage[];
  updatedAt: number;
}

/**
 * Plain in-memory chat history store — one process, not shared across pods.
 * Framework-agnostic core reused by every WISPACE bot; each app decides
 * whether to wrap it behind a distributed backend (e.g. Redis) via
 * `ChatHistoryStorePort`.
 */
export class MemoryChatHistoryStore implements ChatHistoryStorePort {
  private readonly store = new Map<string, ChatHistoryState>();

  constructor(private readonly config: MemoryChatHistoryStoreConfig) {}

  getHistory(externalUserId: string): Promise<ChatHistoryMessage[]> {
    this.evictStale();

    const state = this.store.get(externalUserId);
    if (!state) {
      return Promise.resolve([]);
    }

    if (Date.now() - state.updatedAt > this.config.ttlMs) {
      this.store.delete(externalUserId);
      return Promise.resolve([]);
    }

    return Promise.resolve([...state.messages]);
  }

  async appendTurn(
    externalUserId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    const user = userText.trim();
    const assistant = assistantText.trim();
    if (!user || !assistant) {
      return;
    }

    const existing = await this.getHistory(externalUserId);
    const messages = [
      ...existing,
      { role: 'user' as const, content: user },
      { role: 'assistant' as const, content: assistant },
    ].slice(-this.config.maxMessages);

    this.store.set(externalUserId, {
      messages,
      updatedAt: Date.now(),
    });
  }

  clear(externalUserId: string): Promise<void> {
    this.store.delete(externalUserId);
    return Promise.resolve();
  }

  private evictStale(): void {
    const now = Date.now();

    for (const [externalUserId, state] of this.store) {
      if (now - state.updatedAt > this.config.ttlMs) {
        this.store.delete(externalUserId);
      }
    }
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MemoryChatHistoryStore,
  type ChatHistoryMessage,
} from '@wispace/chat-history';

const DEFAULT_MAX_MESSAGES = 20; // 10 turns (user + assistant)
const DEFAULT_TTL_MS = 30 * 60 * 1000;

/**
 * In-memory only (MVP) — lost on process restart, not shared across pods.
 * Messenger's equivalent (`CHAT_HISTORY_STORE`) supports a Redis-backed mode
 * for multi-pod deployments; add that here if/when discord-bot needs to scale.
 */
@Injectable()
export class DiscordChatHistoryService {
  private readonly store: MemoryChatHistoryStore;

  constructor(configService: ConfigService) {
    const ttlMs =
      Number(configService.get<string>('CHAT_HISTORY_TTL_MS')) ||
      DEFAULT_TTL_MS;
    const maxMessages =
      Number(configService.get<string>('CHAT_HISTORY_MAX_MESSAGES')) ||
      DEFAULT_MAX_MESSAGES;

    this.store = new MemoryChatHistoryStore({ ttlMs, maxMessages });
  }

  getHistory(discordUserId: string): Promise<ChatHistoryMessage[]> {
    return this.store.getHistory(discordUserId);
  }

  appendTurn(
    discordUserId: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    return this.store.appendTurn(discordUserId, userText, assistantText);
  }
}

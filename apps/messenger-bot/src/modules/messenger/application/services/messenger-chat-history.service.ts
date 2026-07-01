import { Inject, Injectable } from '@nestjs/common';
import type { ChatHistoryMessage } from '../../domain/entities/chat-history.types';
import { CHAT_HISTORY_STORE } from '../../domain/repositories/chat-history.store.port';
import type { ChatHistoryStorePort } from '../../domain/repositories/chat-history.store.port';

export type { ChatHistoryMessage } from '../../domain/entities/chat-history.types';

@Injectable()
export class MessengerChatHistoryService {
  constructor(
    @Inject(CHAT_HISTORY_STORE)
    private readonly store: ChatHistoryStorePort,
  ) {}

  getHistory(psid: string): Promise<ChatHistoryMessage[]> {
    return this.store.getHistory(psid);
  }

  appendTurn(
    psid: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    return this.store.appendTurn(psid, userText, assistantText);
  }

  clear(psid: string): Promise<void> {
    return this.store.clear(psid);
  }
}

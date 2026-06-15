import type { ChatHistoryMessage } from '../entities/chat-history.types';

export const CHAT_HISTORY_STORE = Symbol('CHAT_HISTORY_STORE');

export interface ChatHistoryStorePort {
  getHistory(psid: string): Promise<ChatHistoryMessage[]>;
  appendTurn(
    psid: string,
    userText: string,
    assistantText: string,
  ): Promise<void>;
  clear(psid: string): Promise<void>;
}

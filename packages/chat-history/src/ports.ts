import type { ChatHistoryMessage } from './types';

/** Implemented per app/backend (memory, Redis, ...). */
export interface ChatHistoryStorePort {
  getHistory(externalUserId: string): Promise<ChatHistoryMessage[]>;
  appendTurn(
    externalUserId: string,
    userText: string,
    assistantText: string,
  ): Promise<void>;
  clear(externalUserId: string): Promise<void>;
}

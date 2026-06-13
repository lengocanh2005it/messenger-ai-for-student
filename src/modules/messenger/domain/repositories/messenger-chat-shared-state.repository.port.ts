import type {
  AppendChatBufferInput,
  ChatHistoryMessage,
  ChatQueueBufferSnapshot,
  CompleteChatBufferInput,
} from '../entities/chat-shared-state.types';

export const MESSENGER_CHAT_SHARED_STATE_REPOSITORY = Symbol(
  'MESSENGER_CHAT_SHARED_STATE_REPOSITORY',
);

export interface MessengerChatSharedStateRepositoryPort {
  /** Returns true when mid is new (webhook should proceed). */
  tryMarkWebhookSeen(messageMid: string, psid: string): Promise<boolean>;

  purgeStaleWebhookSeen(retentionMs: number): Promise<number>;

  appendChatBuffer(input: AppendChatBufferInput): Promise<void>;

  claimReadyBuffer(
    psid: string,
    debounceMs: number,
    processingStuckMs: number,
  ): Promise<ChatQueueBufferSnapshot | null>;

  completeChatBuffer(input: CompleteChatBufferInput): Promise<boolean>;

  listPsidsReadyForFlush(
    limit: number,
    processingStuckMs: number,
  ): Promise<string[]>;

  getChatHistory(psid: string, ttlMs: number): Promise<ChatHistoryMessage[]>;

  appendChatHistoryTurn(
    psid: string,
    userText: string,
    assistantText: string,
    maxMessages: number,
  ): Promise<void>;

  clearChatHistory(psid: string): Promise<void>;
}

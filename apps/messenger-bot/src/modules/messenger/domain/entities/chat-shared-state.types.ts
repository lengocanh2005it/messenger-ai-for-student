import type { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import type { ChatHistoryMessage } from './chat-history.types';

export interface AppendChatBufferInput {
  psid: string;
  userText: string;
  userId?: number;
  linkContext?: MessengerLinkContext;
  idempotencyKey?: string;
  debounceMs: number;
}

export interface ChatQueueBufferSnapshot {
  psid: string;
  texts: string[];
  lastIdempotencyKey?: string;
  userId?: number;
  linkContext?: MessengerLinkContext;
}

export interface CompleteChatBufferInput {
  psid: string;
  debounceMs: number;
}

export type { ChatHistoryMessage };

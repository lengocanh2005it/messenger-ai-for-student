export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ChatHistoryStoreKind = 'memory' | 'postgres' | 'redis';

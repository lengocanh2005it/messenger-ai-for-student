export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'tool_summary';
  content: string;
}

export type ChatHistoryStoreKind = 'memory' | 'postgres' | 'redis';

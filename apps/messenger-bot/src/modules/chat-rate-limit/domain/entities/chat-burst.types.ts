export type ChatBurstStoreKind = 'memory' | 'postgres' | 'redis';

export const CHAT_BURST_WINDOW_MS = 60_000;

export const CHAT_BURST_KEY_TTL_SECONDS = 120;

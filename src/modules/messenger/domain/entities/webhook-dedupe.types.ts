export type WebhookDedupeStoreKind = 'memory' | 'postgres' | 'redis';

export const WEBHOOK_POSTBACK_DEDUPE_MS = 15_000;

export type ChatQuotaEventType =
  | 'CHAT_QUOTA_RESERVED'
  | 'CHAT_QUOTA_RELEASED'
  | 'CHAT_QUOTA_DENIED';

export type ChatQuotaDenyReason = 'DAILY_LIMIT' | 'BURST_LIMIT';

export type ChatQuotaReleaseReason = 'send_failed' | 'stuck_recover';

export interface ChatQuotaReservedPayload {
  limit: number;
  used_after: number;
  idempotency_key: string;
}

export interface ChatQuotaReleasedPayload {
  reason: ChatQuotaReleaseReason;
  used_after: number;
}

export interface ChatQuotaDeniedPayload {
  reason: ChatQuotaDenyReason;
  limit: number;
  used: number;
}

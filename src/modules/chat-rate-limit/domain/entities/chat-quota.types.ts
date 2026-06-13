export type ChatQuotaDenyReason =
  | 'DAILY_LIMIT'
  | 'BURST_LIMIT'
  | 'NOT_LINKED'
  | 'IDEMPOTENCY_CONFLICT';

export interface ChatQuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: ChatQuotaDenyReason;
  usageDate: string;
  /** True when a DB quota slot was reserved (false for bypass / whitelist). */
  quotaReserved?: boolean;
}

export interface ChatRateLimitSettings {
  enabled: boolean;
  freeFormDailyLimit: number;
  burstPerMinute: number;
  timezone: string;
  whitelistedPsids: string[];
  /** Hiện "còn X lượt" khi remaining <= ngưỡng này (Phase 6). */
  remainingHintThreshold: number;
}

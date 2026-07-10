import type { IncrementDailyUsageInput } from '../entities/chat-daily-usage.types';
import type {
  ChatIdempotencyRecord,
  ChatIdempotencyStatus,
  RecoverIdempotencyOutcome,
  ReserveFreeFormSlotInput,
  ReserveFreeFormSlotOutcome,
  ReserveIdempotencyInput,
} from '../entities/chat-idempotency.types';

export const CHAT_QUOTA_REPOSITORY = Symbol('CHAT_QUOTA_REPOSITORY');

/**
 * Combined repository port for daily usage + idempotency transactions + recovery + ops.
 * Replaces the 4 separate ports (CHAT_USAGE_PORT, CHAT_RESERVATION_PORT,
 * CHAT_RECOVERY_PORT, CHAT_OPS_PORT) that all resolved to the same class.
 */
export interface ChatQuotaRepositoryPort {
  // ─── Daily usage ──────────────────────────────────────────────────────
  getDailyUsageCount(psid: string, usageDate: string): Promise<number>;
  incrementDailyUsage(input: IncrementDailyUsageInput): Promise<number>;
  decrementDailyUsage(psid: string, usageDate: string): Promise<number | null>;

  // ─── Idempotency / reservation ────────────────────────────────────────
  tryReserveIdempotency(
    input: ReserveIdempotencyInput,
  ): Promise<ChatIdempotencyRecord | null>;
  reserveFreeFormSlotInTransaction(
    input: ReserveFreeFormSlotInput,
  ): Promise<ReserveFreeFormSlotOutcome>;
  refundReservedSlot(params: {
    psid: string;
    usageDate: string;
    idempotencyKey: string;
    releaseReason?: 'send_failed' | 'stuck_recover';
    userId?: number;
  }): Promise<boolean>;
  completeReservedSlot(idempotencyKey: string): Promise<boolean>;
  countRecentReservations(
    psid: string,
    since: Date,
    options?: { includeRefunded?: boolean },
  ): Promise<number>;
  updateIdempotencyStatus(
    idempotencyKey: string,
    status: ChatIdempotencyStatus,
  ): Promise<boolean>;
  getIdempotencyByKey(
    idempotencyKey: string,
  ): Promise<ChatIdempotencyRecord | null>;

  // ─── Recovery ─────────────────────────────────────────────────────────
  listStuckReserved(stuckBefore: Date): Promise<ChatIdempotencyRecord[]>;
  recoverIdempotencyForRetry(
    idempotencyKey: string,
    stuckBefore: Date,
  ): Promise<RecoverIdempotencyOutcome>;
  recoverAllStuckReserved(stuckBefore: Date): Promise<string[]>;

  // ─── Ops ──────────────────────────────────────────────────────────────
  countStuckReserved(stuckBefore: Date): Promise<number>;
  countIdempotencyByStatusForUsageDate(
    usageDate: string,
  ): Promise<Record<string, number>>;
  countUsersAtOrAboveDailyLimit(
    usageDate: string,
    dailyLimit: number,
  ): Promise<number>;
}

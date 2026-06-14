import type { IncrementDailyUsageInput } from '../entities/chat-daily-usage.types';
import type {
  ChatIdempotencyRecord,
  ChatIdempotencyStatus,
  RecoverIdempotencyOutcome,
  ReserveFreeFormSlotInput,
  ReserveFreeFormSlotOutcome,
  ReserveIdempotencyInput,
} from '../entities/chat-idempotency.types';

export const CHAT_RATE_LIMIT_REPOSITORY = Symbol('CHAT_RATE_LIMIT_REPOSITORY');

export interface ChatRateLimitRepositoryPort {
  getDailyUsageCount(psid: string, usageDate: string): Promise<number>;

  incrementDailyUsage(input: IncrementDailyUsageInput): Promise<number>;

  decrementDailyUsage(psid: string, usageDate: string): Promise<number | null>;

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

  listStuckReserved(stuckBefore: Date): Promise<ChatIdempotencyRecord[]>;

  recoverIdempotencyForRetry(
    idempotencyKey: string,
    stuckBefore: Date,
  ): Promise<RecoverIdempotencyOutcome>;

  recoverAllStuckReserved(stuckBefore: Date): Promise<string[]>;
}

import type { IncrementDailyUsageInput } from '../entities/chat-daily-usage.types';
import type {
  ChatIdempotencyRecord,
  ChatIdempotencyStatus,
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

  countRecentReservations(psid: string, since: Date): Promise<number>;

  updateIdempotencyStatus(
    idempotencyKey: string,
    status: ChatIdempotencyStatus,
  ): Promise<boolean>;
}

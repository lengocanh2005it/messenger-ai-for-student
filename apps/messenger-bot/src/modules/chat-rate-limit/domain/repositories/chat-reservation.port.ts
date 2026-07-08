import type {
  ReserveFreeFormSlotInput,
  ReserveFreeFormSlotOutcome,
} from '../entities/chat-idempotency.types';

export const CHAT_RESERVATION_PORT = Symbol('CHAT_RESERVATION_PORT');

export interface ChatReservationPort {
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
}

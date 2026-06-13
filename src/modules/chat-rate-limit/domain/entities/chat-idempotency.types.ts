export type ChatIdempotencyStatus = 'reserved' | 'completed' | 'refunded';

export interface ChatIdempotencyRecord {
  idempotencyKey: string;
  psid: string;
  userId?: number;
  usageDate: string;
  status: ChatIdempotencyStatus;
  reservedAt: Date;
}

export interface ReserveIdempotencyInput {
  idempotencyKey: string;
  psid: string;
  userId?: number;
  usageDate: string;
}

export interface ReserveFreeFormSlotInput {
  psid: string;
  userId?: number;
  usageDate: string;
  idempotencyKey: string;
}

export type ReserveFreeFormSlotOutcome =
  | { status: 'reserved'; freeFormCount: number }
  | { status: 'idempotency_conflict' };

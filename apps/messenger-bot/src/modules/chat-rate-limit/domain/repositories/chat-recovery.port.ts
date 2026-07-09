import type {
  ChatIdempotencyRecord,
  RecoverIdempotencyOutcome,
} from '../entities/chat-idempotency.types';

export const CHAT_RECOVERY_PORT = Symbol('CHAT_RECOVERY_PORT');

export interface ChatRecoveryPort {
  listStuckReserved(stuckBefore: Date): Promise<ChatIdempotencyRecord[]>;
  recoverIdempotencyForRetry(
    idempotencyKey: string,
    stuckBefore: Date,
  ): Promise<RecoverIdempotencyOutcome>;
  recoverAllStuckReserved(stuckBefore: Date): Promise<string[]>;
}

import type { EntityManager } from 'typeorm';
import type {
  ChatQuotaDeniedPayload,
  ChatQuotaReleaseReason,
  ChatQuotaReservedPayload,
  ChatQuotaReleasedPayload,
} from '../entities/chat-quota-event.types';

export const CHAT_QUOTA_EVENT_REPOSITORY = Symbol(
  'CHAT_QUOTA_EVENT_REPOSITORY',
);

export interface InsertChatQuotaReservedInput {
  psid: string;
  userId?: number;
  usageDate: string;
  idempotencyKey: string;
  payload: ChatQuotaReservedPayload;
}

export interface InsertChatQuotaReleasedInput {
  psid: string;
  userId?: number;
  usageDate: string;
  idempotencyKey: string;
  reason: ChatQuotaReleaseReason;
  payload: ChatQuotaReleasedPayload;
}

export interface InsertChatQuotaDeniedInput {
  psid: string;
  userId?: number;
  usageDate: string;
  payload: ChatQuotaDeniedPayload;
}

export interface ChatQuotaEventRepositoryPort {
  insertReservedInTransaction(
    manager: EntityManager,
    input: InsertChatQuotaReservedInput,
  ): Promise<void>;

  insertReleasedInTransaction(
    manager: EntityManager,
    input: InsertChatQuotaReleasedInput,
  ): Promise<void>;

  insertDenied(input: InsertChatQuotaDeniedInput): Promise<void>;

  deleteOlderThan(cutoff: Date): Promise<number>;
}

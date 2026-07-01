import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MessengerChatEventEntity } from '../../../../infrastructure/database/entities/messenger-chat-event.entity';
import type {
  ChatQuotaEventRepositoryPort,
  InsertChatQuotaDeniedInput,
  InsertChatQuotaReleasedInput,
  InsertChatQuotaReservedInput,
} from '../../domain/repositories/chat-quota-event.repository.port';

@Injectable()
export class ChatQuotaEventRepository implements ChatQuotaEventRepositoryPort {
  constructor(
    @InjectRepository(MessengerChatEventEntity)
    private readonly eventRepo: Repository<MessengerChatEventEntity>,
  ) {}

  async insertReservedInTransaction(
    manager: EntityManager,
    input: InsertChatQuotaReservedInput,
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO messenger_chat_events (
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          usage_date,
          user_id,
          idempotency_key
        )
        VALUES ($1, 'chat_quota', 'CHAT_QUOTA_RESERVED', $2::jsonb, $3::date, $4, $5)
      `,
      [
        input.psid,
        JSON.stringify(input.payload),
        input.usageDate,
        input.userId ?? null,
        input.idempotencyKey,
      ],
    );
  }

  async insertReleasedInTransaction(
    manager: EntityManager,
    input: InsertChatQuotaReleasedInput,
  ): Promise<void> {
    await manager.query(
      `
        INSERT INTO messenger_chat_events (
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          usage_date,
          user_id,
          idempotency_key
        )
        VALUES ($1, 'chat_quota', 'CHAT_QUOTA_RELEASED', $2::jsonb, $3::date, $4, $5)
      `,
      [
        input.psid,
        JSON.stringify(input.payload),
        input.usageDate,
        input.userId ?? null,
        input.idempotencyKey,
      ],
    );
  }

  async insertDenied(input: InsertChatQuotaDeniedInput): Promise<void> {
    await this.eventRepo.manager.query(
      `
        INSERT INTO messenger_chat_events (
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          usage_date,
          user_id,
          idempotency_key
        )
        VALUES ($1, 'chat_quota', 'CHAT_QUOTA_DENIED', $2::jsonb, $3::date, $4, NULL)
      `,
      [
        input.psid,
        JSON.stringify(input.payload),
        input.usageDate,
        input.userId ?? null,
      ],
    );
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const rows: Array<{ count: string }> = await this.eventRepo.manager.query(
      `
        WITH deleted AS (
          DELETE FROM messenger_chat_events
          WHERE occurred_at < $1
          RETURNING id
        )
        SELECT COUNT(*)::text AS count FROM deleted
      `,
      [cutoff],
    );

    return Number(rows[0]?.count ?? 0);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessengerChatDailyUsageEntity } from '../../../../infrastructure/database/entities/messenger-chat-daily-usage.entity';
import { MessengerChatIdempotencyEntity } from '../../../../infrastructure/database/entities/messenger-chat-idempotency.entity';
import type { IncrementDailyUsageInput } from '../../domain/entities/chat-daily-usage.types';
import type {
  ChatIdempotencyRecord,
  ChatIdempotencyStatus,
  ReserveFreeFormSlotInput,
  ReserveFreeFormSlotOutcome,
  ReserveIdempotencyInput,
} from '../../domain/entities/chat-idempotency.types';
import { ChatRateLimitRepositoryPort } from '../../domain/repositories/chat-rate-limit.repository.port';

@Injectable()
export class ChatRateLimitRepository implements ChatRateLimitRepositoryPort {
  constructor(
    @InjectRepository(MessengerChatDailyUsageEntity)
    private readonly dailyUsageRepo: Repository<MessengerChatDailyUsageEntity>,
    @InjectRepository(MessengerChatIdempotencyEntity)
    private readonly idempotencyRepo: Repository<MessengerChatIdempotencyEntity>,
  ) {}

  async getDailyUsageCount(psid: string, usageDate: string): Promise<number> {
    const row = await this.dailyUsageRepo.findOne({
      where: { psid, usageDate },
      select: { freeFormCount: true },
    });

    return row?.freeFormCount ?? 0;
  }

  async incrementDailyUsage(input: IncrementDailyUsageInput): Promise<number> {
    const rows: Array<{ free_form_count: number }> =
      await this.dailyUsageRepo.manager.query(
        `
          INSERT INTO messenger_chat_daily_usage (psid, user_id, usage_date, free_form_count)
          VALUES ($1, $2, $3::date, 1)
          ON CONFLICT (psid, usage_date)
          DO UPDATE SET
            free_form_count = messenger_chat_daily_usage.free_form_count + 1,
            user_id = COALESCE(EXCLUDED.user_id, messenger_chat_daily_usage.user_id),
            updated_at = now()
          RETURNING free_form_count
        `,
        [input.psid, input.userId ?? null, input.usageDate],
      );

    return rows[0]?.free_form_count ?? 0;
  }

  async decrementDailyUsage(
    psid: string,
    usageDate: string,
  ): Promise<number | null> {
    const rows: Array<{ free_form_count: number }> =
      await this.dailyUsageRepo.manager.query(
        `
          UPDATE messenger_chat_daily_usage
          SET
            free_form_count = GREATEST(free_form_count - 1, 0),
            updated_at = now()
          WHERE psid = $1 AND usage_date = $2::date
          RETURNING free_form_count
        `,
        [psid, usageDate],
      );

    return rows[0]?.free_form_count ?? null;
  }

  async tryReserveIdempotency(
    input: ReserveIdempotencyInput,
    manager = this.idempotencyRepo.manager,
  ): Promise<ChatIdempotencyRecord | null> {
    const rows: Array<{
      idempotency_key: string;
      psid: string;
      user_id: number | null;
      usage_date: string;
      status: ChatIdempotencyStatus;
      reserved_at: Date;
    }> = await manager.query(
      `
        INSERT INTO messenger_chat_idempotency (
          idempotency_key,
          psid,
          user_id,
          usage_date,
          status
        )
        VALUES ($1, $2, $3, $4::date, 'reserved')
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING
          idempotency_key,
          psid,
          user_id,
          usage_date,
          status,
          reserved_at
      `,
      [input.idempotencyKey, input.psid, input.userId ?? null, input.usageDate],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return this.mapIdempotency(row);
  }

  async reserveFreeFormSlotInTransaction(
    input: ReserveFreeFormSlotInput,
  ): Promise<ReserveFreeFormSlotOutcome> {
    return this.dailyUsageRepo.manager.transaction(async (manager) => {
      const idempotency = await this.tryReserveIdempotency(input, manager);
      if (!idempotency) {
        return { status: 'idempotency_conflict' };
      }

      const rows: Array<{ free_form_count: number }> = await manager.query(
        `
          INSERT INTO messenger_chat_daily_usage (psid, user_id, usage_date, free_form_count)
          VALUES ($1, $2, $3::date, 1)
          ON CONFLICT (psid, usage_date)
          DO UPDATE SET
            free_form_count = messenger_chat_daily_usage.free_form_count + 1,
            user_id = COALESCE(EXCLUDED.user_id, messenger_chat_daily_usage.user_id),
            updated_at = now()
          RETURNING free_form_count
        `,
        [input.psid, input.userId ?? null, input.usageDate],
      );

      return {
        status: 'reserved',
        freeFormCount: rows[0]?.free_form_count ?? 0,
      };
    });
  }

  async refundReservedSlot(params: {
    psid: string;
    usageDate: string;
    idempotencyKey: string;
  }): Promise<boolean> {
    return this.dailyUsageRepo.manager.transaction(async (manager) => {
      const refundedRows: Array<{ idempotency_key: string }> =
        await manager.query(
          `
            UPDATE messenger_chat_idempotency
            SET status = 'refunded'
            WHERE idempotency_key = $1 AND status = 'reserved'
            RETURNING idempotency_key
          `,
          [params.idempotencyKey],
        );

      if (!refundedRows[0]) {
        return false;
      }

      await manager.query(
        `
          UPDATE messenger_chat_daily_usage
          SET
            free_form_count = GREATEST(free_form_count - 1, 0),
            updated_at = now()
          WHERE psid = $1 AND usage_date = $2::date
        `,
        [params.psid, params.usageDate],
      );

      return true;
    });
  }

  async completeReservedSlot(idempotencyKey: string): Promise<boolean> {
    const rows: Array<{ idempotency_key: string }> =
      await this.idempotencyRepo.manager.query(
        `
          UPDATE messenger_chat_idempotency
          SET status = 'completed'
          WHERE idempotency_key = $1 AND status = 'reserved'
          RETURNING idempotency_key
        `,
        [idempotencyKey],
      );

    return rows.length > 0;
  }

  async countRecentReservations(psid: string, since: Date): Promise<number> {
    const rows: Array<{ count: string }> =
      await this.idempotencyRepo.manager.query(
        `
        SELECT COUNT(*)::text AS count
        FROM messenger_chat_idempotency
        WHERE psid = $1 AND reserved_at > $2
      `,
        [psid, since],
      );

    return Number(rows[0]?.count ?? 0);
  }

  async updateIdempotencyStatus(
    idempotencyKey: string,
    status: ChatIdempotencyStatus,
  ): Promise<boolean> {
    const result = await this.idempotencyRepo.update(
      { idempotencyKey },
      { status },
    );

    return (result.affected ?? 0) > 0;
  }

  private mapIdempotency(row: {
    idempotency_key: string;
    psid: string;
    user_id: number | null;
    usage_date: string;
    status: ChatIdempotencyStatus;
    reserved_at: Date;
  }): ChatIdempotencyRecord {
    return {
      idempotencyKey: row.idempotency_key,
      psid: row.psid,
      userId: row.user_id ?? undefined,
      usageDate: row.usage_date,
      status: row.status,
      reservedAt: row.reserved_at,
    };
  }
}

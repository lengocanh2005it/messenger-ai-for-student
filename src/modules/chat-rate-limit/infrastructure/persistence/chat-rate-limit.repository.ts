import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessengerChatDailyUsageEntity } from '../../../../infrastructure/database/entities/messenger-chat-daily-usage.entity';
import { MessengerChatIdempotencyEntity } from '../../../../infrastructure/database/entities/messenger-chat-idempotency.entity';
import type { IncrementDailyUsageInput } from '../../domain/entities/chat-daily-usage.types';
import type {
  ChatIdempotencyRecord,
  ChatIdempotencyStatus,
  RecoverIdempotencyOutcome,
  ReserveFreeFormSlotInput,
  ReserveFreeFormSlotOutcome,
  ReserveIdempotencyInput,
} from '../../domain/entities/chat-idempotency.types';
import { ChatQuotaEventRecorderService } from '../../application/services/chat-quota-event-recorder.service';
import { ChatRateLimitRepositoryPort } from '../../domain/repositories/chat-rate-limit.repository.port';

class DailyLimitExceededError extends Error {
  constructor() {
    super('Daily limit exceeded during reserve transaction');
    this.name = 'DailyLimitExceededError';
  }
}

@Injectable()
export class ChatRateLimitRepository implements ChatRateLimitRepositoryPort {
  constructor(
    @InjectRepository(MessengerChatDailyUsageEntity)
    private readonly dailyUsageRepo: Repository<MessengerChatDailyUsageEntity>,
    @InjectRepository(MessengerChatIdempotencyEntity)
    private readonly idempotencyRepo: Repository<MessengerChatIdempotencyEntity>,
    private readonly quotaEventRecorder: ChatQuotaEventRecorderService,
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
    try {
      return await this.dailyUsageRepo.manager.transaction(async (manager) => {
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
            WHERE messenger_chat_daily_usage.free_form_count < $4
            RETURNING free_form_count
          `,
          [input.psid, input.userId ?? null, input.usageDate, input.dailyLimit],
        );

        if (!rows[0]) {
          throw new DailyLimitExceededError();
        }

        const freeFormCount = rows[0]?.free_form_count ?? 0;
        await this.quotaEventRecorder.recordReservedInTransaction(manager, {
          psid: input.psid,
          userId: input.userId,
          usageDate: input.usageDate,
          idempotencyKey: input.idempotencyKey,
          limit: input.dailyLimit,
          usedAfter: freeFormCount,
        });

        return {
          status: 'reserved',
          freeFormCount,
        };
      });
    } catch (error) {
      if (error instanceof DailyLimitExceededError) {
        return { status: 'daily_limit_exceeded' };
      }

      throw error;
    }
  }

  async refundReservedSlot(params: {
    psid: string;
    usageDate: string;
    idempotencyKey: string;
    releaseReason?: 'send_failed' | 'stuck_recover';
    userId?: number;
  }): Promise<boolean> {
    const releaseReason = params.releaseReason ?? 'send_failed';

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

      const usageRows: Array<{ free_form_count: number }> = await manager.query(
        `
          UPDATE messenger_chat_daily_usage
          SET
            free_form_count = GREATEST(free_form_count - 1, 0),
            updated_at = now()
          WHERE psid = $1 AND usage_date = $2::date
          RETURNING free_form_count
        `,
        [params.psid, params.usageDate],
      );

      const usedAfter = usageRows[0]?.free_form_count ?? 0;
      await this.quotaEventRecorder.recordReleasedInTransaction(manager, {
        psid: params.psid,
        userId: params.userId,
        usageDate: params.usageDate,
        idempotencyKey: params.idempotencyKey,
        reason: releaseReason,
        usedAfter,
      });

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

  async countRecentReservations(
    psid: string,
    since: Date,
    options: { includeRefunded?: boolean } = {},
  ): Promise<number> {
    const includeRefunded = options.includeRefunded ?? false;
    const statusFilter = includeRefunded
      ? ''
      : ` AND status IN ('reserved', 'completed')`;

    const rows: Array<{ count: string }> =
      await this.idempotencyRepo.manager.query(
        `
        SELECT COUNT(*)::text AS count
        FROM messenger_chat_idempotency
        WHERE psid = $1 AND reserved_at > $2${statusFilter}
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

  async getIdempotencyByKey(
    idempotencyKey: string,
  ): Promise<ChatIdempotencyRecord | null> {
    const row = await this.idempotencyRepo.findOne({
      where: { idempotencyKey },
    });

    if (!row) {
      return null;
    }

    return {
      idempotencyKey: row.idempotencyKey,
      psid: row.psid,
      userId: row.userId ?? undefined,
      usageDate: row.usageDate,
      status: row.status,
      reservedAt: row.reservedAt,
    };
  }

  async listStuckReserved(stuckBefore: Date): Promise<ChatIdempotencyRecord[]> {
    const rows: Array<{
      idempotency_key: string;
      psid: string;
      user_id: number | null;
      usage_date: string;
      status: ChatIdempotencyStatus;
      reserved_at: Date;
    }> = await this.idempotencyRepo.manager.query(
      `
        SELECT
          idempotency_key,
          psid,
          user_id,
          usage_date,
          status,
          reserved_at
        FROM messenger_chat_idempotency
        WHERE status = 'reserved' AND reserved_at < $1
        ORDER BY reserved_at ASC
      `,
      [stuckBefore],
    );

    return rows.map((row) => this.mapIdempotency(row));
  }

  async recoverIdempotencyForRetry(
    idempotencyKey: string,
    stuckBefore: Date,
  ): Promise<RecoverIdempotencyOutcome> {
    return this.idempotencyRepo.manager.transaction(async (manager) => {
      const rows: Array<{
        idempotency_key: string;
        psid: string;
        user_id: number | null;
        usage_date: string;
        status: ChatIdempotencyStatus;
        reserved_at: Date;
      }> = await manager.query(
        `
          SELECT
            idempotency_key,
            psid,
            user_id,
            usage_date,
            status,
            reserved_at
          FROM messenger_chat_idempotency
          WHERE idempotency_key = $1
          FOR UPDATE
        `,
        [idempotencyKey],
      );

      const row = rows[0];
      if (!row) {
        return 'not_found';
      }

      if (row.status === 'completed') {
        return 'completed';
      }

      if (row.status === 'reserved') {
        const reservedAt = new Date(row.reserved_at);
        if (reservedAt >= stuckBefore) {
          return 'in_flight';
        }

        const refundedRows: Array<{ idempotency_key: string }> =
          await manager.query(
            `
              UPDATE messenger_chat_idempotency
              SET status = 'refunded'
              WHERE idempotency_key = $1 AND status = 'reserved'
              RETURNING idempotency_key
            `,
            [idempotencyKey],
          );

        if (!refundedRows[0]) {
          return 'not_found';
        }

        const usageRows: Array<{ free_form_count: number }> =
          await manager.query(
            `
            UPDATE messenger_chat_daily_usage
            SET
              free_form_count = GREATEST(free_form_count - 1, 0),
              updated_at = now()
            WHERE psid = $1 AND usage_date = $2::date
            RETURNING free_form_count
          `,
            [row.psid, row.usage_date],
          );

        const usedAfter = usageRows[0]?.free_form_count ?? 0;
        await this.quotaEventRecorder.recordReleasedInTransaction(manager, {
          psid: row.psid,
          userId: row.user_id ?? undefined,
          usageDate: row.usage_date,
          idempotencyKey,
          reason: 'stuck_recover',
          usedAfter,
        });

        await manager.query(
          `
            DELETE FROM messenger_chat_idempotency
            WHERE idempotency_key = $1
          `,
          [idempotencyKey],
        );

        return 'reopened';
      }

      if (row.status === 'refunded') {
        await manager.query(
          `
            DELETE FROM messenger_chat_idempotency
            WHERE idempotency_key = $1
          `,
          [idempotencyKey],
        );

        return 'reopened';
      }

      return 'not_found';
    });
  }

  async recoverAllStuckReserved(stuckBefore: Date): Promise<string[]> {
    const stuck = await this.listStuckReserved(stuckBefore);
    const recovered: string[] = [];

    for (const row of stuck) {
      const outcome = await this.recoverIdempotencyForRetry(
        row.idempotencyKey,
        stuckBefore,
      );
      if (outcome === 'reopened') {
        recovered.push(row.idempotencyKey);
      }
    }

    return recovered;
  }

  async countStuckReserved(stuckBefore: Date): Promise<number> {
    return this.idempotencyRepo
      .createQueryBuilder('row')
      .where(`row.status = 'reserved'`)
      .andWhere('row.reserved_at < :stuckBefore', { stuckBefore })
      .getCount();
  }

  async countIdempotencyByStatusForUsageDate(
    usageDate: string,
  ): Promise<Record<string, number>> {
    const rows = await this.idempotencyRepo
      .createQueryBuilder('row')
      .select('row.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('row.usage_date = :usageDate', { usageDate })
      .groupBy('row.status')
      .getRawMany<{ status: string; count: number }>();

    return Object.fromEntries(rows.map((row) => [row.status, row.count]));
  }

  async countUsersAtOrAboveDailyLimit(
    usageDate: string,
    dailyLimit: number,
  ): Promise<number> {
    const row = await this.dailyUsageRepo
      .createQueryBuilder('usage')
      .select('COUNT(*)::int', 'count')
      .where('usage.usage_date = :usageDate', { usageDate })
      .andWhere('usage.free_form_count >= :dailyLimit', { dailyLimit })
      .getRawOne<{ count: number }>();

    return row?.count ?? 0;
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

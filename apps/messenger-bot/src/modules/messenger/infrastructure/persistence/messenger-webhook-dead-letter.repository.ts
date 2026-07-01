import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessengerWebhookDeadLetterEntity } from '../../../../infrastructure/database/entities/messenger-webhook-dead-letter.entity';
import type {
  ListPendingForRetryOptions,
  MessengerWebhookDeadLetterRepositoryPort,
  SaveDeadLetterInput,
  WebhookDeadLetterRecord,
} from '../../domain/repositories/messenger-webhook-dead-letter.repository.port';

@Injectable()
export class MessengerWebhookDeadLetterRepository implements MessengerWebhookDeadLetterRepositoryPort {
  constructor(
    @InjectRepository(MessengerWebhookDeadLetterEntity)
    private readonly repo: Repository<MessengerWebhookDeadLetterEntity>,
  ) {}

  async save(input: SaveDeadLetterInput): Promise<WebhookDeadLetterRecord> {
    const entity = this.repo.create({
      psid: input.psid,
      messageMid: input.messageMid,
      rawPayload: input.rawPayload,
      errorMessage: input.errorMessage,
      retryCount: 0,
      status: 'pending',
      replayedAt: null,
    });
    const saved = await this.repo.save(entity);
    return this.map(saved);
  }

  async listPending(limit: number): Promise<WebhookDeadLetterRecord[]> {
    const rows = await this.repo.find({
      where: { status: 'pending' },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => this.map(r));
  }

  async listPendingForRetry(
    opts: ListPendingForRetryOptions,
  ): Promise<WebhookDeadLetterRecord[]> {
    // updated_at < olderThan acts as a natural cooldown between retries:
    // after incrementRetry bumps updated_at, the entry won't be picked up
    // again until at least minRetryAgeMs has passed.
    const rows: MessengerWebhookDeadLetterEntity[] =
      await this.repo.manager.query(
        `SELECT *
         FROM messenger_webhook_dead_letters
         WHERE status = 'pending'
           AND retry_count < $1
           AND updated_at < $2
         ORDER BY created_at ASC
         LIMIT $3`,
        [opts.maxRetries, opts.olderThan, opts.limit],
      );
    return rows.map((r) => this.map(r));
  }

  async markReplayed(id: number): Promise<void> {
    await this.repo.update(id, {
      status: 'replayed',
      replayedAt: new Date(),
    });
  }

  async markAbandoned(id: number, reason: string): Promise<void> {
    await this.repo.update(id, {
      status: 'abandoned',
      errorMessage: reason,
    });
  }

  async incrementRetry(id: number, errorMessage: string): Promise<void> {
    await this.repo.manager.query(
      `UPDATE messenger_webhook_dead_letters
       SET retry_count = retry_count + 1,
           error_message = $2,
           updated_at = now()
       WHERE id = $1`,
      [id, errorMessage],
    );
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('r.status')
      .getRawMany<{ status: string; count: number }>();

    return Object.fromEntries(rows.map((r) => [r.status, r.count]));
  }

  private map(e: MessengerWebhookDeadLetterEntity): WebhookDeadLetterRecord {
    return {
      id: e.id,
      psid: e.psid,
      messageMid: e.messageMid,
      rawPayload: e.rawPayload,
      errorMessage: e.errorMessage,
      retryCount: e.retryCount,
      status: e.status,
      replayedAt: e.replayedAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}

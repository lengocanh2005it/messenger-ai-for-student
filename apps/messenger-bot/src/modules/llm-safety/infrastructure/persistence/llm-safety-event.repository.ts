import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LlmSafetyEventEntity } from '../../../../infrastructure/database/entities/llm-safety-event.entity';
import type { InsertLlmSafetyEvent } from '../../domain/entities/llm-safety-event.types';
import type { LlmSafetyEventRepositoryPort } from '../../domain/repositories/llm-safety-event.repository.port';

@Injectable()
export class LlmSafetyEventRepository implements LlmSafetyEventRepositoryPort {
  constructor(
    @InjectRepository(LlmSafetyEventEntity)
    private readonly repo: Repository<LlmSafetyEventEntity>,
  ) {}

  async insert(event: InsertLlmSafetyEvent): Promise<void> {
    const entity = this.repo.create({
      feature: event.feature,
      eventType: event.eventType,
      reason: event.reason ?? null,
      platform: 'messenger',
      externalUserId: event.psid ?? null,
      userId: event.userId ?? null,
      correlationId: event.correlationId ?? null,
      payload: event.payload ?? null,
    });
    await this.repo.save(entity);
  }

  async countSince(since: Date): Promise<number> {
    return this.repo
      .createQueryBuilder('e')
      .where('e.createdAt >= :since', { since })
      .getCount();
  }

  async deleteOlderThan(before: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('"created_at" < :before', { before })
      .execute();

    return result.affected ?? 0;
  }
}

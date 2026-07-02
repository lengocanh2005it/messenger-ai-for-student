import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LlmSafetyEventEntity,
  LlmSafetyEventRepository as ChatMeteringLlmSafetyEventRepository,
} from '@wispace/chat-metering';
import type { InsertLlmSafetyEvent } from '../../domain/entities/llm-safety-event.types';
import type { LlmSafetyEventRepositoryPort } from '../../domain/repositories/llm-safety-event.repository.port';

/** This repository only ever writes rows for the Messenger bot. */
const PLATFORM = 'messenger' as const;

@Injectable()
export class LlmSafetyEventRepository implements LlmSafetyEventRepositoryPort {
  private readonly core: ChatMeteringLlmSafetyEventRepository;

  constructor(
    @InjectRepository(LlmSafetyEventEntity)
    repo: Repository<LlmSafetyEventEntity>,
  ) {
    this.core = new ChatMeteringLlmSafetyEventRepository(repo, PLATFORM);
  }

  insert(event: InsertLlmSafetyEvent): Promise<void> {
    return this.core.insert({ ...event, externalUserId: event.psid });
  }

  countSince(since: Date): Promise<number> {
    return this.core.countSince(since);
  }

  deleteOlderThan(before: Date): Promise<number> {
    return this.core.deleteOlderThan(before);
  }
}

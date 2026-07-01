import { Inject, Injectable } from '@nestjs/common';
import { CHAT_BURST_WINDOW_MS } from '../../domain/entities/chat-burst.types';
import type { ChatBurstCounterPort } from '../../domain/repositories/chat-burst-counter.port';
import {
  CHAT_RATE_LIMIT_REPOSITORY,
  type ChatRateLimitRepositoryPort,
} from '../../domain/repositories/chat-rate-limit.repository.port';
import { ChatRateLimitConfigService } from '../../application/services/chat-rate-limit-config.service';

@Injectable()
export class PostgresChatBurstCounter implements ChatBurstCounterPort {
  constructor(
    private readonly configService: ChatRateLimitConfigService,
    @Inject(CHAT_RATE_LIMIT_REPOSITORY)
    private readonly repository: ChatRateLimitRepositoryPort,
  ) {}

  getBurstCount(psid: string): Promise<number> {
    return this.repository.countRecentReservations(
      psid,
      new Date(Date.now() - CHAT_BURST_WINDOW_MS),
      {
        includeRefunded: this.configService.getBurstCountsRefunded(),
      },
    );
  }

  // Postgres burst is derived from the chat_rate_limit_usage table (already written
  // atomically by reserveFreeFormSlotInTransaction). No separate increment needed —
  // just check the current count against the limit.
  async tryReserveBurst(
    psid: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    const count = await this.getBurstCount(psid);
    return { allowed: count < limit, count };
  }

  recordReservation(_psid: string): Promise<void> {
    void _psid;
    return Promise.resolve();
  }

  releaseReservation(_psid: string): Promise<void> {
    void _psid;
    return Promise.resolve();
  }
}

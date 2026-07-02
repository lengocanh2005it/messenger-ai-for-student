import { Inject, Injectable } from '@nestjs/common';
import { PostgresBurstCounter } from '@wispace/chat-metering';
import type { ChatBurstCounterPort } from '../../domain/repositories/chat-burst-counter.port';
import {
  CHAT_RATE_LIMIT_REPOSITORY,
  type ChatRateLimitRepositoryPort,
} from '../../domain/repositories/chat-rate-limit.repository.port';
import { ChatRateLimitConfigService } from '../../application/services/chat-rate-limit-config.service';

/** Thin NestJS wrapper around the shared `@wispace/chat-metering` Postgres-derived burst counter. */
@Injectable()
export class PostgresChatBurstCounter implements ChatBurstCounterPort {
  private readonly core: PostgresBurstCounter;

  constructor(
    private readonly configService: ChatRateLimitConfigService,
    @Inject(CHAT_RATE_LIMIT_REPOSITORY)
    repository: ChatRateLimitRepositoryPort,
  ) {
    this.core = new PostgresBurstCounter(
      {
        countRecentReservations: (psid, since, options) =>
          repository.countRecentReservations(psid, since, options),
      },
      this.configService.getBurstCountsRefunded(),
    );
  }

  getBurstCount(psid: string): Promise<number> {
    return this.core.getBurstCount(psid);
  }

  tryReserveBurst(
    psid: string,
    limit: number,
  ): Promise<{ allowed: boolean; count: number }> {
    return this.core.tryReserveBurst(psid, limit);
  }

  recordReservation(psid: string): Promise<void> {
    return this.core.recordReservation(psid);
  }

  releaseReservation(psid: string): Promise<void> {
    return this.core.releaseReservation(psid);
  }
}

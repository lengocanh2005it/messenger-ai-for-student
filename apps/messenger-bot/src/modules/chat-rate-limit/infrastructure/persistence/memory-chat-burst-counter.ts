import { Injectable } from '@nestjs/common';
import { MemoryBurstCounter } from '@wispace/chat-metering';
import type { ChatBurstCounterPort } from '../../domain/repositories/chat-burst-counter.port';

/** Thin NestJS wrapper around the shared `@wispace/chat-metering` in-memory burst counter. */
@Injectable()
export class MemoryChatBurstCounter implements ChatBurstCounterPort {
  private readonly core = new MemoryBurstCounter();

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

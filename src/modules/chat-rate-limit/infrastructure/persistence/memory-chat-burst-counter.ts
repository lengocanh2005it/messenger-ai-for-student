import { Injectable } from '@nestjs/common';
import { CHAT_BURST_WINDOW_MS } from '../../domain/entities/chat-burst.types';
import type { ChatBurstCounterPort } from '../../domain/repositories/chat-burst-counter.port';

@Injectable()
export class MemoryChatBurstCounter implements ChatBurstCounterPort {
  private readonly counts = new Map<string, number>();

  getBurstCount(psid: string): Promise<number> {
    this.evictStaleBuckets();
    return Promise.resolve(this.counts.get(this.bucketKey(psid)) ?? 0);
  }

  recordReservation(psid: string): Promise<void> {
    const key = this.bucketKey(psid);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    return Promise.resolve();
  }

  releaseReservation(psid: string): Promise<void> {
    const key = this.bucketKey(psid);
    const current = this.counts.get(key) ?? 0;
    if (current <= 1) {
      this.counts.delete(key);
    } else {
      this.counts.set(key, current - 1);
    }
    return Promise.resolve();
  }

  private bucketKey(psid: string): string {
    return `${psid}:${this.currentBucket()}`;
  }

  private currentBucket(): number {
    return Math.floor(Date.now() / CHAT_BURST_WINDOW_MS);
  }

  private evictStaleBuckets(): void {
    const current = this.currentBucket();

    for (const key of this.counts.keys()) {
      const bucket = Number(key.split(':').pop());
      if (!Number.isFinite(bucket) || bucket < current - 1) {
        this.counts.delete(key);
      }
    }
  }
}

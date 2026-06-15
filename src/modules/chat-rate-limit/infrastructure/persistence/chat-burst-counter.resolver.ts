import { Injectable } from '@nestjs/common';
import type { ChatBurstCounterPort } from '../../domain/repositories/chat-burst-counter.port';
import { ChatRateLimitConfigService } from '../../application/services/chat-rate-limit-config.service';
import { MemoryChatBurstCounter } from './memory-chat-burst-counter';
import { PostgresChatBurstCounter } from './postgres-chat-burst-counter';
import { RedisChatBurstCounter } from './redis-chat-burst-counter';

@Injectable()
export class ChatBurstCounterResolver implements ChatBurstCounterPort {
  constructor(
    private readonly configService: ChatRateLimitConfigService,
    private readonly memoryCounter: MemoryChatBurstCounter,
    private readonly postgresCounter: PostgresChatBurstCounter,
    private readonly redisCounter: RedisChatBurstCounter,
  ) {}

  getBurstCount(psid: string): Promise<number> {
    return this.resolveCounter().getBurstCount(psid);
  }

  recordReservation(psid: string): Promise<void> {
    return this.resolveCounter().recordReservation(psid);
  }

  releaseReservation(psid: string): Promise<void> {
    return this.resolveCounter().releaseReservation(psid);
  }

  resolveStoreKind(): 'memory' | 'postgres' | 'redis' {
    const configured = this.configService.getBurstStore();

    if (configured === 'redis' && this.redisCounter.isAvailable()) {
      return 'redis';
    }

    if (configured === 'redis') {
      return 'postgres';
    }

    if (configured === 'memory') {
      return 'memory';
    }

    return 'postgres';
  }

  private resolveCounter(): ChatBurstCounterPort {
    switch (this.resolveStoreKind()) {
      case 'redis':
        return this.redisCounter;
      case 'memory':
        return this.memoryCounter;
      default:
        return this.postgresCounter;
    }
  }
}

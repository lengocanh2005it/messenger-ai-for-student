import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../../../../infrastructure/redis/domain/redis.client.port';
import type { RedisClientPort } from '../../../../infrastructure/redis/domain/redis.client.port';
import {
  CHAT_BURST_KEY_TTL_SECONDS,
  CHAT_BURST_WINDOW_MS,
} from '../../domain/entities/chat-burst.types';
import type { ChatBurstCounterPort } from '../../domain/repositories/chat-burst-counter.port';

@Injectable()
export class RedisChatBurstCounter implements ChatBurstCounterPort {
  private static readonly KEY_PREFIX = 'burst:';

  private readonly logger = new Logger(RedisChatBurstCounter.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: RedisClientPort,
  ) {}

  isAvailable(): boolean {
    return (
      this.redisClient.isEnabled() &&
      this.redisClient.getNativeClient() !== null
    );
  }

  async getBurstCount(psid: string): Promise<number> {
    const client = this.redisClient.getNativeClient();
    if (!client) {
      return 0;
    }

    try {
      const raw = await client.get(this.key(psid));
      return Number(raw ?? 0);
    } catch (error) {
      this.logger.warn(
        `Redis burst read failed psid=${psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 0;
    }
  }

  async recordReservation(psid: string): Promise<void> {
    const client = this.redisClient.getNativeClient();
    if (!client) {
      return;
    }

    const key = this.key(psid);

    try {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, CHAT_BURST_KEY_TTL_SECONDS);
      }
    } catch (error) {
      this.logger.warn(
        `Redis burst increment failed psid=${psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async releaseReservation(psid: string): Promise<void> {
    const client = this.redisClient.getNativeClient();
    if (!client) {
      return;
    }

    const key = this.key(psid);

    try {
      const raw = await client.get(key);
      const current = Number(raw ?? 0);
      if (current <= 1) {
        await client.del(key);
        return;
      }

      await client.decr(key);
    } catch (error) {
      this.logger.warn(
        `Redis burst decrement failed psid=${psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private key(psid: string): string {
    const bucket = Math.floor(Date.now() / CHAT_BURST_WINDOW_MS);
    return `${RedisChatBurstCounter.KEY_PREFIX}${psid}:${bucket}`;
  }
}

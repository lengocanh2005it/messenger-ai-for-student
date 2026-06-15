import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisConfigService } from '../application/services/redis-config.service';
import type {
  RedisClientPort,
  RedisPingResult,
} from '../domain/redis.client.port';

@Injectable()
export class IoredisRedisClient implements RedisClientPort, OnModuleDestroy {
  private readonly client: Redis | null;

  constructor(private readonly redisConfig: RedisConfigService) {
    if (!redisConfig.isEnabled()) {
      this.client = null;
      return;
    }

    this.client = new Redis({
      host: redisConfig.getHost(),
      port: redisConfig.getPort(),
      password: redisConfig.getPassword(),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      enableOfflineQueue: false,
    });
  }

  isEnabled(): boolean {
    return this.redisConfig.isEnabled();
  }

  getNativeClient(): Redis | null {
    return this.client;
  }

  async ping(): Promise<RedisPingResult> {
    if (!this.isEnabled() || !this.client) {
      return { status: 'disabled' };
    }

    const startedAt = Date.now();

    try {
      const response = await this.client.ping();
      if (response !== 'PONG') {
        return {
          status: 'error',
          message: `Unexpected PING response: ${String(response)}`,
        };
      }

      return {
        status: 'ok',
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}

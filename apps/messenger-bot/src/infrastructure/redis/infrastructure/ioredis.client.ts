import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisConfigService } from '../application/services/redis-config.service';
import type {
  RedisClientPort,
  RedisPingResult,
} from '../domain/redis.client.port';

@Injectable()
export class IoredisRedisClient implements RedisClientPort, OnModuleDestroy {
  private readonly logger = new Logger(IoredisRedisClient.name);
  private readonly client: Redis | null;
  private loggedSuccessfulPing = false;

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

    this.client.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Redis client error: ${message}`);
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
      await this.ensureConnected();
      const response = await this.client.ping();
      if (response !== 'PONG') {
        return {
          status: 'error',
          message: `Unexpected PING response: ${String(response)}`,
        };
      }

      const latencyMs = Date.now() - startedAt;
      this.logSuccessfulPing(latencyMs);

      return {
        status: 'ok',
        latencyMs,
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

  private async ensureConnected(): Promise<void> {
    if (!this.client || this.client.status === 'ready') {
      return;
    }

    if (
      this.client.status === 'wait' ||
      this.client.status === 'close' ||
      this.client.status === 'end'
    ) {
      await this.client.connect();
    }
  }

  private logSuccessfulPing(latencyMs: number): void {
    if (this.loggedSuccessfulPing) {
      return;
    }

    this.loggedSuccessfulPing = true;
    this.logger.log(
      `Redis PING OK (${this.redisConfig.getHost()}:${this.redisConfig.getPort()}, ${latencyMs}ms)`,
    );
  }
}

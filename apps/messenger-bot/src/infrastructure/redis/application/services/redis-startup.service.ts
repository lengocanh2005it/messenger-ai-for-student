import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { REDIS_CLIENT } from '../../domain/redis.client.port';
import type { RedisClientPort } from '../../domain/redis.client.port';
import { RedisConfigService } from './redis-config.service';

@Injectable()
export class RedisStartupService implements OnModuleInit {
  private readonly logger = new Logger(RedisStartupService.name);

  constructor(
    private readonly redisConfig: RedisConfigService,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: RedisClientPort,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redisConfig.isEnabled()) {
      this.logger.log('Redis disabled (REDIS_ENABLED=false)');
      return;
    }

    const result = await this.redisClient.ping();

    if (result.status === 'ok') {
      return;
    }

    this.logger.error(
      `Redis PING failed (${this.redisConfig.getHost()}:${this.redisConfig.getPort()}): ${result.message ?? 'unknown error'}`,
    );
  }
}

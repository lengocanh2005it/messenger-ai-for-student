import { Global, Module } from '@nestjs/common';
import { RedisConfigService } from './application/services/redis-config.service';
import { RedisStartupService } from './application/services/redis-startup.service';
import { REDIS_CLIENT } from './domain/redis.client.port';
import { IoredisRedisClient } from './infrastructure/ioredis.client';

@Global()
@Module({
  providers: [
    RedisConfigService,
    IoredisRedisClient,
    RedisStartupService,
    {
      provide: REDIS_CLIENT,
      useExisting: IoredisRedisClient,
    },
  ],
  exports: [RedisConfigService, REDIS_CLIENT],
})
export class RedisModule {}

import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { REDIS_CLIENT } from './infrastructure/redis/domain/redis.client.port';
import type { RedisClientPort } from './infrastructure/redis/domain/redis.client.port';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: RedisClientPort,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/db')
  async checkDatabase() {
    await this.dataSource.query('SELECT 1');
    return { ok: true, database: 'connected', orm: 'typeorm' };
  }

  @Get('health/redis')
  async checkRedis() {
    const result = await this.redisClient.ping();

    if (result.status === 'disabled') {
      return { ok: true, redis: 'disabled' };
    }

    if (result.status === 'ok') {
      return {
        ok: true,
        redis: 'connected',
        latencyMs: result.latencyMs,
      };
    }

    throw new ServiceUnavailableException({
      ok: false,
      redis: 'error',
      message: result.message,
    });
  }
}

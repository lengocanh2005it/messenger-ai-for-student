import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisConfigService } from '../../../../infrastructure/redis/application/services/redis-config.service';
import { ChatBurstCounterResolver } from '../../infrastructure/persistence/chat-burst-counter.resolver';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';

@Injectable()
export class ChatBurstCounterStartupService implements OnModuleInit {
  private readonly logger = new Logger(ChatBurstCounterStartupService.name);

  constructor(
    private readonly configService: ChatRateLimitConfigService,
    private readonly redisConfig: RedisConfigService,
    private readonly burstCounterResolver: ChatBurstCounterResolver,
  ) {}

  onModuleInit(): void {
    if (!this.configService.isEnabled()) {
      return;
    }

    const configured = this.configService.getBurstStore();
    const active = this.burstCounterResolver.resolveStoreKind();

    if (configured === 'redis' && !this.redisConfig.isEnabled()) {
      this.logger.warn(
        'CHAT_BURST_STORE=redis but REDIS_ENABLED=false — using postgres fallback',
      );
      return;
    }

    if (configured === 'redis' && active === 'postgres') {
      this.logger.warn(
        'CHAT_BURST_STORE=redis but Redis client unavailable — using postgres fallback',
      );
      return;
    }

    this.logger.log(
      `Chat burst counter active=${active} configured=${configured} limit=${this.configService.getBurstPerMinute()}/min`,
    );
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisConfigService } from '../../../../infrastructure/redis/application/services/redis-config.service';
import { ChatHistoryStoreResolver } from '../../infrastructure/persistence/chat-history.store.resolver';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';

@Injectable()
export class ChatHistoryStoreStartupService implements OnModuleInit {
  private readonly logger = new Logger(ChatHistoryStoreStartupService.name);

  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    private readonly redisConfig: RedisConfigService,
    private readonly chatHistoryStoreResolver: ChatHistoryStoreResolver,
  ) {}

  onModuleInit(): void {
    const configured = this.sharedConfig.getHistoryStore();
    const active = this.chatHistoryStoreResolver.resolveStoreKind();

    if (this.chatHistoryStoreResolver.isConfiguredPostgres()) {
      this.logger.warn(
        'CHAT_HISTORY_STORE=postgres is no longer supported (table dropped) — active=memory/redis',
      );
    }

    if (configured === 'redis' && !this.redisConfig.isEnabled()) {
      this.logger.warn(
        'CHAT_HISTORY_STORE=redis but REDIS_ENABLED=false — using memory fallback',
      );
      return;
    }

    if (configured === 'redis' && active === 'memory') {
      this.logger.warn(
        'CHAT_HISTORY_STORE=redis but Redis client unavailable — using memory fallback',
      );
      return;
    }

    this.logger.log(
      `Chat history store active=${active} configured=${configured} ttlMs=${this.sharedConfig.getHistoryTtlMs()} maxMessages=${this.sharedConfig.getHistoryMaxMessages()}`,
    );
  }
}

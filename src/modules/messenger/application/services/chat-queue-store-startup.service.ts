import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisConfigService } from '../../../../infrastructure/redis/application/services/redis-config.service';
import { ChatQueueStoreResolver } from '../../infrastructure/persistence/chat-queue.store.resolver';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';

@Injectable()
export class ChatQueueStoreStartupService implements OnModuleInit {
  private readonly logger = new Logger(ChatQueueStoreStartupService.name);

  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    private readonly redisConfig: RedisConfigService,
    private readonly chatQueueStoreResolver: ChatQueueStoreResolver,
  ) {}

  onModuleInit(): void {
    const configured = this.sharedConfig.getQueueStore();

    if (!this.sharedConfig.isDistributedQueueEnabled()) {
      this.logger.log('Chat queue store active=memory (in-process debounce)');
      return;
    }

    if (this.chatQueueStoreResolver.isConfiguredPostgres()) {
      this.logger.warn(
        'CHAT_QUEUE_STORE=postgres is no longer supported (table dropped) — active=redis',
      );
    }

    if (!this.redisConfig.isEnabled()) {
      this.logger.warn(
        'Distributed chat queue requires REDIS_ENABLED=true — buffer ops may fail',
      );
      return;
    }

    this.logger.log(
      `Chat queue store active=redis configured=${configured} stuckMs=${this.sharedConfig.getProcessingStuckMs()}`,
    );
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisConfigService } from '../../../../infrastructure/redis/application/services/redis-config.service';
import { WebhookDedupeStoreResolver } from '../../infrastructure/persistence/webhook-dedupe.store.resolver';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';

@Injectable()
export class WebhookDedupeStoreStartupService implements OnModuleInit {
  private readonly logger = new Logger(WebhookDedupeStoreStartupService.name);

  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    private readonly redisConfig: RedisConfigService,
    private readonly webhookDedupeStoreResolver: WebhookDedupeStoreResolver,
  ) {}

  onModuleInit(): void {
    const configured = this.sharedConfig.getDedupeStore();
    const active = this.webhookDedupeStoreResolver.resolveStoreKind();

    if (configured === 'redis' && !this.redisConfig.isEnabled()) {
      this.logger.warn(
        'CHAT_DEDUPE_STORE=redis but REDIS_ENABLED=false — using memory fallback',
      );
      return;
    }

    if (configured === 'redis' && active === 'memory') {
      this.logger.warn(
        'CHAT_DEDUPE_STORE=redis but Redis client unavailable — using memory fallback',
      );
      return;
    }

    if (configured === 'postgres' && active === 'postgres') {
      this.logger.log(
        'Webhook dedupe active=postgres (message.mid in DB; postback dedupe per instance memory)',
      );
      return;
    }

    this.logger.log(
      `Webhook dedupe active=${active} configured=${configured} midRetentionMs=${this.sharedConfig.getWebhookDedupeRetentionMs()}`,
    );
  }
}

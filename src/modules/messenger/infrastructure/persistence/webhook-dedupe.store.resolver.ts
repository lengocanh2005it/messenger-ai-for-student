import { Injectable } from '@nestjs/common';
import type { WebhookDedupeStorePort } from '../../domain/repositories/webhook-dedupe.store.port';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';
import { MemoryWebhookDedupeStore } from './memory-webhook-dedupe.store';
import { PostgresWebhookDedupeStore } from './postgres-webhook-dedupe.store';
import { RedisWebhookDedupeStore } from './redis-webhook-dedupe.store';

@Injectable()
export class WebhookDedupeStoreResolver implements WebhookDedupeStorePort {
  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    private readonly memoryStore: MemoryWebhookDedupeStore,
    private readonly postgresStore: PostgresWebhookDedupeStore,
    private readonly redisStore: RedisWebhookDedupeStore,
  ) {}

  isDuplicateMessageMid(mid: string, psid: string): Promise<boolean> {
    return this.resolveStore().isDuplicateMessageMid(mid, psid);
  }

  isDuplicatePostback(psid: string, payload: string): Promise<boolean> {
    return this.resolveStore().isDuplicatePostback(psid, payload);
  }

  resolveStoreKind(): 'memory' | 'postgres' | 'redis' {
    const configured = this.sharedConfig.getDedupeStore();

    if (configured === 'redis' && this.redisStore.isAvailable()) {
      return 'redis';
    }

    if (configured === 'redis') {
      return 'memory';
    }

    if (configured === 'postgres') {
      return 'postgres';
    }

    return 'memory';
  }

  private resolveStore(): WebhookDedupeStorePort {
    switch (this.resolveStoreKind()) {
      case 'redis':
        return this.redisStore;
      case 'postgres':
        return this.postgresStore;
      default:
        return this.memoryStore;
    }
  }
}

import { Injectable } from '@nestjs/common';
import type { ChatHistoryMessage } from '../../domain/entities/chat-history.types';
import type { ChatHistoryStorePort } from '../../domain/repositories/chat-history.store.port';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';
import { MemoryChatHistoryStore } from './memory-chat-history.store';
import { PostgresChatHistoryStore } from './postgres-chat-history.store';
import { RedisChatHistoryStore } from './redis-chat-history.store';

@Injectable()
export class ChatHistoryStoreResolver implements ChatHistoryStorePort {
  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    private readonly memoryStore: MemoryChatHistoryStore,
    private readonly postgresStore: PostgresChatHistoryStore,
    private readonly redisStore: RedisChatHistoryStore,
  ) {}

  getHistory(psid: string): Promise<ChatHistoryMessage[]> {
    return this.resolveStore().getHistory(psid);
  }

  appendTurn(
    psid: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    return this.resolveStore().appendTurn(psid, userText, assistantText);
  }

  clear(psid: string): Promise<void> {
    return this.resolveStore().clear(psid);
  }

  resolveStoreKind(): 'memory' | 'postgres' | 'redis' {
    const configured = this.sharedConfig.getHistoryStore();

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

  private resolveStore(): ChatHistoryStorePort {
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

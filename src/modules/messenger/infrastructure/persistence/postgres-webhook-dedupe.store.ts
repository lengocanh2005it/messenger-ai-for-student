import { Inject, Injectable } from '@nestjs/common';
import type { WebhookDedupeStorePort } from '../../domain/repositories/webhook-dedupe.store.port';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import type { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import { MemoryWebhookDedupeStore } from './memory-webhook-dedupe.store';

@Injectable()
export class PostgresWebhookDedupeStore implements WebhookDedupeStorePort {
  constructor(
    @Inject(MESSENGER_CHAT_SHARED_STATE_REPOSITORY)
    private readonly sharedState: MessengerChatSharedStateRepositoryPort,
    private readonly memoryStore: MemoryWebhookDedupeStore,
  ) {}

  async isDuplicateMessageMid(mid: string, psid: string): Promise<boolean> {
    const isNew = await this.sharedState.tryMarkWebhookSeen(mid, psid);
    return !isNew;
  }

  isDuplicatePostback(psid: string, payload: string): Promise<boolean> {
    return this.memoryStore.isDuplicatePostback(psid, payload);
  }
}

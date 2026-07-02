import { Injectable } from '@nestjs/common';
import { MemoryChatHistoryStore as MemoryChatHistoryStoreCore } from '@wispace/chat-history';
import type { ChatHistoryMessage } from '../../domain/entities/chat-history.types';
import type { ChatHistoryStorePort } from '../../domain/repositories/chat-history.store.port';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';

@Injectable()
export class MemoryChatHistoryStore implements ChatHistoryStorePort {
  private readonly core: MemoryChatHistoryStoreCore;

  constructor(sharedConfig: MessengerChatSharedConfigService) {
    this.core = new MemoryChatHistoryStoreCore({
      ttlMs: sharedConfig.getHistoryTtlMs(),
      maxMessages: sharedConfig.getHistoryMaxMessages(),
    });
  }

  getHistory(psid: string): Promise<ChatHistoryMessage[]> {
    return this.core.getHistory(psid);
  }

  appendTurn(
    psid: string,
    userText: string,
    assistantText: string,
  ): Promise<void> {
    return this.core.appendTurn(psid, userText, assistantText);
  }

  clear(psid: string): Promise<void> {
    return this.core.clear(psid);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { ChatHistoryStorePort } from '../../domain/repositories/chat-history.store.port';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import type { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import { MessengerChatSharedConfigService } from '../../application/services/messenger-chat-shared-config.service';

@Injectable()
export class PostgresChatHistoryStore implements ChatHistoryStorePort {
  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    @Inject(MESSENGER_CHAT_SHARED_STATE_REPOSITORY)
    private readonly sharedState: MessengerChatSharedStateRepositoryPort,
  ) {}

  getHistory(psid: string) {
    return this.sharedState.getChatHistory(
      psid,
      this.sharedConfig.getHistoryTtlMs(),
    );
  }

  appendTurn(psid: string, userText: string, assistantText: string) {
    return this.sharedState.appendChatHistoryTurn(
      psid,
      userText,
      assistantText,
      this.sharedConfig.getHistoryMaxMessages(),
    );
  }

  clear(psid: string) {
    return this.sharedState.clearChatHistory(psid);
  }
}

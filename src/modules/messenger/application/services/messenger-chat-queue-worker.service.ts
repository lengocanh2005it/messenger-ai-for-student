import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import type { MessengerChatSharedStateRepositoryPort } from '../../domain/repositories/messenger-chat-shared-state.repository.port';
import { MessengerChatQueueService } from './messenger-chat-queue.service';
import { MessengerChatSharedConfigService } from './messenger-chat-shared-config.service';

@Injectable()
export class MessengerChatQueueWorkerService {
  private readonly logger = new Logger(MessengerChatQueueWorkerService.name);

  constructor(
    private readonly sharedConfig: MessengerChatSharedConfigService,
    private readonly chatQueueService: MessengerChatQueueService,
    @Inject(MESSENGER_CHAT_SHARED_STATE_REPOSITORY)
    private readonly sharedState: MessengerChatSharedStateRepositoryPort,
  ) {}

  @Cron('*/2 * * * * *', {
    name: 'messenger-chat-queue-flush',
  })
  async pollReadyBuffers(): Promise<void> {
    if (!this.sharedConfig.isSharedQueueEnabled()) {
      return;
    }

    try {
      const psids = await this.sharedState.listPsidsReadyForFlush(
        25,
        this.sharedConfig.getProcessingStuckMs(),
      );

      for (const psid of psids) {
        await this.chatQueueService.flushReady(psid);
      }
    } catch (error) {
      this.logger.error(
        `Shared chat queue poll failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Cron('0 */15 * * * *', {
    name: 'messenger-chat-webhook-dedupe-cleanup',
  })
  async purgeStaleWebhookSeen(): Promise<void> {
    if (!this.sharedConfig.isSharedQueueEnabled()) {
      return;
    }

    try {
      const deleted = await this.sharedState.purgeStaleWebhookSeen(
        this.sharedConfig.getWebhookDedupeRetentionMs(),
      );

      if (deleted > 0) {
        this.logger.log(
          `Purged ${deleted} stale messenger_chat_webhook_seen row(s)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Webhook dedupe cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

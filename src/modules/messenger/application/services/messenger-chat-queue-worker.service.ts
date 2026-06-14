import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ADVISORY_LOCK } from '../../../../shared/common/advisory-lock-ids';
import { PgAdvisoryLockService } from '../../../../shared/common/pg-advisory-lock.service';
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
    private readonly pgLock: PgAdvisoryLockService,
  ) {}

  @Cron('*/2 * * * * *', {
    name: 'messenger-chat-queue-flush',
  })
  async pollReadyBuffers(): Promise<void> {
    if (!this.sharedConfig.isSharedQueueEnabled()) {
      return;
    }

    // No cron lock: claimReadyBuffer uses SELECT FOR UPDATE per psid,
    // so all pods can poll in parallel and safely process different PSIDs.
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

    const result = await this.pgLock.withLock(
      ADVISORY_LOCK.MESSENGER_WEBHOOK_CLEANUP,
      async () => {
        try {
          const deleted = await this.sharedState.purgeStaleWebhookSeen(
            this.sharedConfig.getWebhookDedupeRetentionMs(),
          );

          if (deleted > 0) {
            this.logger.log(
              `Purged ${deleted} stale messenger_chat_webhook_seen row(s)`,
            );
          }

          return deleted;
        } catch (error) {
          this.logger.error(
            `Webhook dedupe cleanup failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return 0;
        }
      },
    );

    if (result === null) {
      this.logger.debug(
        'messenger-chat-webhook-dedupe-cleanup skipped — lock held by another pod',
      );
    }
  }
}

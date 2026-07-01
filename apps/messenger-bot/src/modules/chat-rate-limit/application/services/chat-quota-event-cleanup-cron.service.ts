import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ADVISORY_LOCK } from '../../../../shared/common/advisory-lock-ids';
import { PgAdvisoryLockService } from '../../../../shared/common/pg-advisory-lock.service';
import { ChatQuotaEventCleanupService } from './chat-quota-event-cleanup.service';

@Injectable()
export class ChatQuotaEventCleanupCronService {
  private readonly logger = new Logger(ChatQuotaEventCleanupCronService.name);

  constructor(
    private readonly cleanupService: ChatQuotaEventCleanupService,
    private readonly pgLock: PgAdvisoryLockService,
  ) {}

  /** Purge old quota audit events — 03:30 ICT on the 1st of each month. */
  @Cron('0 30 3 1 * *', {
    name: 'chat-quota-events-cleanup',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleMonthlyCleanup(): Promise<void> {
    if (!this.cleanupService.isEnabled()) {
      return;
    }

    const result = await this.pgLock.withLock(
      ADVISORY_LOCK.CHAT_QUOTA_EVENTS_CLEANUP,
      () => this.cleanupService.purgeExpiredEvents(),
    );

    if (result === null) {
      this.logger.debug(
        'chat-quota-events-cleanup skipped — lock held by another pod',
      );
    }
  }
}

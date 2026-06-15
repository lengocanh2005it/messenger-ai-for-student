import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ADVISORY_LOCK } from '../../../../shared/common/advisory-lock-ids';
import { PgAdvisoryLockService } from '../../../../shared/common/pg-advisory-lock.service';
import { MessengerMessageLogCleanupService } from './messenger-message-log-cleanup.service';

@Injectable()
export class MessengerMessageLogCleanupCronService {
  private readonly logger = new Logger(
    MessengerMessageLogCleanupCronService.name,
  );

  constructor(
    private readonly cleanupService: MessengerMessageLogCleanupService,
    private readonly pgLock: PgAdvisoryLockService,
  ) {}

  /** Purge old audit rows — 03:00 ICT on the 1st of each month. */
  @Cron('0 0 3 1 * *', {
    name: 'messenger-message-log-cleanup',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleMonthlyCleanup(): Promise<void> {
    if (!this.cleanupService.isEnabled()) {
      return;
    }

    const result = await this.pgLock.withLock(
      ADVISORY_LOCK.MESSENGER_MESSAGE_LOG_CLEANUP,
      () => this.cleanupService.purgeExpiredLogs(),
    );

    if (result === null) {
      this.logger.debug(
        'messenger-message-log-cleanup skipped — lock held by another pod',
      );
    }
  }
}

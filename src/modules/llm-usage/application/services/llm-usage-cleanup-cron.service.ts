import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ADVISORY_LOCK } from '../../../../shared/common/advisory-lock-ids';
import { PgAdvisoryLockService } from '../../../../shared/common/pg-advisory-lock.service';
import { LlmUsageCleanupService } from './llm-usage-cleanup.service';

@Injectable()
export class LlmUsageCleanupCronService {
  private readonly logger = new Logger(LlmUsageCleanupCronService.name);

  constructor(
    private readonly cleanupService: LlmUsageCleanupService,
    private readonly pgLock: PgAdvisoryLockService,
  ) {}

  /** Purge old LLM usage rows — 04:00 ICT on the 1st of each month. */
  @Cron('0 0 4 1 * *', {
    name: 'llm-usage-cleanup',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async handleMonthlyCleanup(): Promise<void> {
    if (!this.cleanupService.isEnabled()) {
      return;
    }

    const result = await this.pgLock.withLock(
      ADVISORY_LOCK.LLM_USAGE_CLEANUP,
      () => this.cleanupService.purgeExpiredUsage(),
    );

    if (result === null) {
      this.logger.debug(
        'llm-usage-cleanup skipped — lock held by another pod',
      );
    }
  }
}

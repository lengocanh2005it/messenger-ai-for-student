import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LlmSafetyEventService } from './llm-safety-event.service';

@Injectable()
export class LlmSafetyCleanupService {
  private readonly logger = new Logger(LlmSafetyCleanupService.name);

  constructor(
    private readonly llmSafetyEventService: LlmSafetyEventService,
  ) {}

  @Cron('0 3 * * *', { name: 'llm-safety-cleanup', timeZone: 'Asia/Ho_Chi_Minh' })
  async runCleanup(): Promise<void> {
    if (!this.llmSafetyEventService.isEnabled()) return;

    try {
      await this.llmSafetyEventService.deleteOlderThanRetentionDays();
    } catch (err) {
      this.logger.warn(
        `llm-safety-cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

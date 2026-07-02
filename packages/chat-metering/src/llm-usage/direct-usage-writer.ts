import type { LlmUsageRepository } from './llm-usage.repository';
import type { RecordLlmUsageInput, UsageWriterPort } from './types';

/**
 * Fire-and-forget insert straight to Postgres — no queue/retry. Good enough
 * for lower-traffic bots; apps that need retry/backpressure (e.g.
 * messenger-bot's BullMQ queue) should implement `UsageWriterPort`
 * themselves and wrap/replace this.
 */
export class DirectUsageWriter implements UsageWriterPort {
  constructor(
    private readonly repository: LlmUsageRepository,
    private readonly onError?: (error: unknown) => void,
  ) {}

  write(event: RecordLlmUsageInput & { usageDate: string }): void {
    this.repository.insertUsage(event).catch((error: unknown) => {
      this.onError?.(error);
    });
  }
}

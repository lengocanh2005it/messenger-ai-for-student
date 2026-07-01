import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_SAFETY_EVENT_REPOSITORY } from '../../domain/repositories/llm-safety-event.repository.port';
import type { LlmSafetyEventRepositoryPort } from '../../domain/repositories/llm-safety-event.repository.port';

export interface RecordGroundingWarningInput {
  psid: string;
  userId?: number;
  correlationId?: string;
  reason: string;
  userTextPreview?: string;
  assistantTextPreview?: string;
  toolNamesUsed: string[];
}

@Injectable()
export class LlmSafetyEventService {
  private readonly logger = new Logger(LlmSafetyEventService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(LLM_SAFETY_EVENT_REPOSITORY)
    private readonly repository: LlmSafetyEventRepositoryPort,
  ) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('LLM_SAFETY_EVENTS_ENABLED')
      ?.trim()
      .toLowerCase();
    return raw !== 'false' && raw !== '0';
  }

  /** Best-effort — never throws. */
  recordGroundingWarning(input: RecordGroundingWarningInput): void {
    if (!this.isEnabled()) return;

    const payload: Record<string, unknown> = {
      toolNamesUsed: input.toolNamesUsed,
    };
    if (input.userTextPreview) {
      payload['userTextPreview'] = input.userTextPreview.slice(0, 200);
    }
    if (input.assistantTextPreview) {
      payload['assistantTextPreview'] = input.assistantTextPreview.slice(
        0,
        200,
      );
    }

    this.repository
      .insert({
        feature: 'FREE_FORM_CHAT',
        eventType: 'GROUNDING_WARNING',
        reason: input.reason,
        psid: input.psid,
        userId: input.userId,
        correlationId: input.correlationId,
        payload,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `LlmSafetyEventService.recordGroundingWarning failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  async countWarnings24h(): Promise<number> {
    if (!this.isEnabled()) return 0;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.repository.countSince(since);
  }

  async deleteOlderThanRetentionDays(): Promise<number> {
    const days = this.readRetentionDays();
    const before = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const deleted = await this.repository.deleteOlderThan(before);
    if (deleted > 0) {
      this.logger.log(
        `LLM_SAFETY_CLEANUP deleted=${deleted} older_than_days=${days}`,
      );
    }
    return deleted;
  }

  readWarningDailyThreshold(): number {
    const raw = this.configService
      .get<string>('LLM_SAFETY_WARNING_DAILY_THRESHOLD')
      ?.trim();
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 5;
  }

  private readRetentionDays(): number {
    const raw = this.configService
      .get<string>('LLM_SAFETY_EVENT_RETENTION_DAYS')
      ?.trim();
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 30;
  }
}

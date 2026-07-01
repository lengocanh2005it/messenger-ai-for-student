import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLM_USAGE_REPOSITORY,
  type LlmUsageRepositoryPort,
} from '../../domain/repositories/llm-usage.repository.port';
import { LlmUsageConfigService } from './llm-usage-config.service';

@Injectable()
export class LlmUsageCleanupService {
  private readonly logger = new Logger(LlmUsageCleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly llmConfig: LlmUsageConfigService,
    @Inject(LLM_USAGE_REPOSITORY)
    private readonly usageRepository: LlmUsageRepositoryPort,
  ) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('LLM_USAGE_CLEANUP_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return this.llmConfig.isEnabled();
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getRetentionDays(): number {
    return this.llmConfig.getRetentionDays();
  }

  async purgeExpiredUsage(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = this.getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted = await this.usageRepository.deleteOlderThan(cutoff);

    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} llm_usage_events row(s) older than ${retentionDays} day(s) (before ${cutoff.toISOString()})`,
      );
    } else {
      this.logger.log(
        `llm_usage_events cleanup: 0 rows older than ${retentionDays} day(s)`,
      );
    }

    return { deleted, cutoff: cutoff.toISOString() };
  }
}

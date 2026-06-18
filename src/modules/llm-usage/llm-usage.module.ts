import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../shared/common/common.module';
import { LlmUsageEventEntity } from '../../infrastructure/database/entities/llm-usage-event.entity';
import { LlmUsageCleanupCronService } from './application/services/llm-usage-cleanup-cron.service';
import { LlmUsageCleanupService } from './application/services/llm-usage-cleanup.service';
import { LlmUsageConfigService } from './application/services/llm-usage-config.service';
import { LlmUsageRecorderService } from './application/services/llm-usage-recorder.service';
import { LLM_USAGE_REPOSITORY } from './domain/repositories/llm-usage.repository.port';
import { LlmUsageRepository } from './infrastructure/persistence/llm-usage.repository';

@Module({
  imports: [CommonModule, TypeOrmModule.forFeature([LlmUsageEventEntity])],
  providers: [
    LlmUsageConfigService,
    LlmUsageRepository,
    {
      provide: LLM_USAGE_REPOSITORY,
      useExisting: LlmUsageRepository,
    },
    LlmUsageRecorderService,
    LlmUsageCleanupService,
    LlmUsageCleanupCronService,
  ],
  exports: [LlmUsageRecorderService, LlmUsageConfigService],
})
export class LlmUsageModule {}

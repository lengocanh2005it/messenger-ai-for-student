import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../shared/common/common.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { MessengerOutboundModule } from '../messenger/messenger-outbound.module';
import { LlmUsageEventEntity } from '../../infrastructure/database/entities/llm-usage-event.entity';
import { LlmUsageCleanupCronService } from './application/services/llm-usage-cleanup-cron.service';
import { LlmUsageCleanupService } from './application/services/llm-usage-cleanup.service';
import { LlmUsageConfigService } from './application/services/llm-usage-config.service';
import { LlmUsageQueryService } from './application/services/llm-usage-query.service';
import { LlmUsageRecorderService } from './application/services/llm-usage-recorder.service';
import { LLM_USAGE_REPOSITORY } from './domain/repositories/llm-usage.repository.port';
import { LlmUsageBullQueueService } from './infrastructure/queue/llm-usage-bull-queue.service';
import { LlmUsageRepository } from './infrastructure/persistence/llm-usage.repository';
import { LlmUsageController } from './presentation/controllers/llm-usage.controller';

@Module({
  imports: [
    CommonModule,
    RedisModule,
    MessengerOutboundModule,
    TypeOrmModule.forFeature([LlmUsageEventEntity]),
  ],
  controllers: [LlmUsageController],
  providers: [
    LlmUsageConfigService,
    LlmUsageRepository,
    {
      provide: LLM_USAGE_REPOSITORY,
      useExisting: LlmUsageRepository,
    },
    LlmUsageBullQueueService,
    LlmUsageRecorderService,
    LlmUsageQueryService,
    LlmUsageCleanupService,
    LlmUsageCleanupCronService,
  ],
  exports: [
    LlmUsageRecorderService,
    LlmUsageConfigService,
    LlmUsageQueryService,
  ],
})
export class LlmUsageModule {}

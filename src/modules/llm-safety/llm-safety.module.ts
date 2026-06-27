import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmSafetyEventEntity } from '../../infrastructure/database/entities/llm-safety-event.entity';
import { LLM_SAFETY_EVENT_REPOSITORY } from './domain/repositories/llm-safety-event.repository.port';
import { LlmSafetyEventRepository } from './infrastructure/persistence/llm-safety-event.repository';
import { LlmSafetyEventService } from './application/services/llm-safety-event.service';
import { LlmSafetyCleanupService } from './application/services/llm-safety-cleanup.service';

@Module({
  imports: [TypeOrmModule.forFeature([LlmSafetyEventEntity])],
  providers: [
    LlmSafetyEventRepository,
    {
      provide: LLM_SAFETY_EVENT_REPOSITORY,
      useExisting: LlmSafetyEventRepository,
    },
    LlmSafetyEventService,
    LlmSafetyCleanupService,
  ],
  exports: [LlmSafetyEventService],
})
export class LlmSafetyModule {}

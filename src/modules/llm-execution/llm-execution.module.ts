import { Module } from '@nestjs/common';
import { LlmExecutionConfigService } from './application/services/llm-execution-config.service';
import { LlmExecutionService } from './application/services/llm-execution.service';

@Module({
  providers: [LlmExecutionConfigService, LlmExecutionService],
  exports: [LlmExecutionService, LlmExecutionConfigService],
})
export class LlmExecutionModule {}

import { Module } from '@nestjs/common';
import { LlmExecutionConfigService } from './application/services/llm-execution-config.service';
import { LlmExecutionService } from './application/services/llm-execution.service';
import { createLlmProviderAdapter } from '@wispace/llm-agent';
import type { LlmProviderAdapter } from '@wispace/llm-agent';

/**
 * Provides LLM execution infrastructure: concurrency control, retry, timeout,
 * and the provider-agnostic LLM adapter.
 */
@Module({
  providers: [
    LlmExecutionConfigService,
    LlmExecutionService,
    {
      provide: 'LLM_PROVIDER_ADAPTER',
      useFactory: (config: LlmExecutionConfigService): LlmProviderAdapter => {
        return createLlmProviderAdapter({
          getApiKey: () => config.getApiKey(),
          getModel: () => config.getModel(),
          getBaseUrl: () => config.getBaseUrl(),
          provider: config.getProvider(),
        });
      },
      inject: [LlmExecutionConfigService],
    },
  ],
  exports: [
    LlmExecutionService,
    LlmExecutionConfigService,
    'LLM_PROVIDER_ADAPTER',
  ],
})
export class LlmExecutionModule {}

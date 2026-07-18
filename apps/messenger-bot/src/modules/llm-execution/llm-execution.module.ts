import { Module } from '@nestjs/common';
import { LlmExecutionConfigService } from './application/services/llm-execution-config.service';
import { LlmExecutionService } from './application/services/llm-execution.service';
import {
  createLlmProviderAdapter,
  createFailoverLlmProviderAdapter,
} from '@wispace/llm-agent';
import type {
  LlmProviderAdapter,
  LlmProviderEntryConfig,
} from '@wispace/llm-agent';

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
        const order = config.getFailoverOrder();

        if (order.length === 0) {
          return createLlmProviderAdapter({
            getApiKey: () => config.getApiKey(),
            getModel: () => config.getModel(),
            getBaseUrl: () => config.getBaseUrl(),
            provider: config.getProvider(),
          });
        }

        const entries: LlmProviderEntryConfig[] = [
          {
            provider: 'openai',
            getApiKey: () => config.getApiKey(),
            getModel: () => config.getModel(),
            getBaseUrl: () => config.getBaseUrl(),
          },
          {
            provider: 'openrouter',
            getApiKey: () => config.getOpenRouterApiKey(),
            getModel: () => config.getOpenRouterModel(),
            getBaseUrl: () => config.getOpenRouterBaseUrl(),
          },
          {
            provider: 'minimax',
            getApiKey: () => config.getMiniMaxApiKey(),
            getModel: () => config.getMiniMaxModel(),
            getBaseUrl: () => config.getMiniMaxBaseUrl(),
          },
        ];

        return createFailoverLlmProviderAdapter(
          entries,
          order,
          {
            warn: (msg) => console.warn(msg),
          },
          {
            cooldownLongMs: config.getFailoverCooldownLongMs(),
            cooldownShortMs: config.getFailoverCooldownShortMs(),
            quickRetryDelayMs: config.getFailoverQuickRetryDelayMs(),
          },
        );
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

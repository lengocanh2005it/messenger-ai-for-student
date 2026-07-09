import type { LlmProviderAdapter } from './llm-provider.adapter';
import { OpenAiAdapter } from './openai/openai-adapter';
import { OpenAiCompatibleAdapter } from './openai-compatible/openai-compatible-adapter';

export type LlmProviderType = string;

/**
 * Factory to create the appropriate LlmProviderAdapter based on the
 * LLM_PROVIDER environment variable.
 */
export function createLlmProviderAdapter(config: {
  getApiKey: () => string | undefined;
  getModel: () => string;
  getBaseUrl?: () => string | undefined;
  provider?: LlmProviderType;
}): LlmProviderAdapter {
  const provider = config.provider ?? 'openai';

  switch (provider) {
    case 'openai':
      return new OpenAiAdapter(
        config.getApiKey,
        config.getModel,
        config.getBaseUrl,
      );

    case 'openai-compatible':
      return new OpenAiCompatibleAdapter(
        config.getApiKey,
        config.getModel,
        config.getBaseUrl,
      );

    default:
      // Fallback: try OpenAI adapter for unknown providers (may work if compatible)
      return new OpenAiAdapter(
        config.getApiKey,
        config.getModel,
        config.getBaseUrl,
        provider,
      );
  }
}

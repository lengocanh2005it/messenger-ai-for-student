/**
 * OpenAI-compatible adapter for non-OpenAI providers that use the same API format
 * (vLLM, Ollama, LM Studio, Together, etc.). Just sets a different provider name.
 */
import { OpenAiAdapter } from '../openai/openai-adapter';

export class OpenAiCompatibleAdapter extends OpenAiAdapter {
  constructor(
    getApiKey: () => string | undefined,
    getModel?: () => string,
    getBaseUrl?: () => string | undefined,
  ) {
    super(getApiKey, getModel, getBaseUrl, 'openai-compatible');
  }
}

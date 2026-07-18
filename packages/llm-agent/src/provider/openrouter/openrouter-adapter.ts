import { OpenAiAdapter } from '../openai/openai-adapter';

const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterAdapter extends OpenAiAdapter {
  constructor(
    getApiKey: () => string | undefined,
    getModel?: () => string,
    getBaseUrl?: () => string | undefined,
  ) {
    super(
      getApiKey,
      getModel ?? (() => DEFAULT_OPENROUTER_MODEL),
      getBaseUrl ?? (() => DEFAULT_OPENROUTER_BASE_URL),
      'openrouter',
    );
  }
}

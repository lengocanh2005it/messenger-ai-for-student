import { OpenAiAdapter } from '../openai/openai-adapter';

const DEFAULT_MINIMAX_MODEL = 'MiniMax-Text-01';
const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.chat/v1';

export class MiniMaxAdapter extends OpenAiAdapter {
  constructor(
    getApiKey: () => string | undefined,
    getModel?: () => string,
    getBaseUrl?: () => string | undefined,
  ) {
    super(
      getApiKey,
      getModel ?? (() => DEFAULT_MINIMAX_MODEL),
      getBaseUrl ?? (() => DEFAULT_MINIMAX_BASE_URL),
      'minimax',
    );
  }
}

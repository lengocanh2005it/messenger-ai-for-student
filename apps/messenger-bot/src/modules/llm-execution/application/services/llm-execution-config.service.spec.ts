import { ConfigService } from '@nestjs/config';
import { LlmExecutionConfigService } from './llm-execution-config.service';

function makeConfigService(
  env: Record<string, string | undefined>,
): ConfigService {
  return {
    get: <T = string>(key: string): T | undefined => {
      return env[key] as T | undefined;
    },
  } as unknown as ConfigService;
}

describe('LlmExecutionConfigService', () => {
  describe('getFailoverOrder', () => {
    it('returns empty array when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getFailoverOrder()).toEqual([]);
    });

    it('parses CSV correctly', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({
          LLM_PROVIDER_FAILOVER_ORDER: 'openai,openrouter,minimax',
        }),
      );
      expect(svc.getFailoverOrder()).toEqual([
        'openai',
        'openrouter',
        'minimax',
      ]);
    });

    it('trims whitespace', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({
          LLM_PROVIDER_FAILOVER_ORDER: ' openai , openrouter ',
        }),
      );
      expect(svc.getFailoverOrder()).toEqual(['openai', 'openrouter']);
    });

    it('filters empty entries', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({
          LLM_PROVIDER_FAILOVER_ORDER: 'openai,,openrouter,',
        }),
      );
      expect(svc.getFailoverOrder()).toEqual(['openai', 'openrouter']);
    });
  });

  describe('getOpenRouterApiKey', () => {
    it('returns undefined when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getOpenRouterApiKey()).toBeUndefined();
    });

    it('returns trimmed key', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({ OPENROUTER_API_KEY: ' sk-or-123 ' }),
      );
      expect(svc.getOpenRouterApiKey()).toBe('sk-or-123');
    });
  });

  describe('getOpenRouterModel', () => {
    it('returns default when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getOpenRouterModel()).toBe('openai/gpt-4o-mini');
    });

    it('returns configured model', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({ OPENROUTER_MODEL: 'anthropic/claude-3.5-sonnet' }),
      );
      expect(svc.getOpenRouterModel()).toBe('anthropic/claude-3.5-sonnet');
    });
  });

  describe('getOpenRouterBaseUrl', () => {
    it('returns default when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getOpenRouterBaseUrl()).toBe('https://openrouter.ai/api/v1');
    });
  });

  describe('getMiniMaxApiKey', () => {
    it('returns undefined when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getMiniMaxApiKey()).toBeUndefined();
    });
  });

  describe('getMiniMaxModel', () => {
    it('returns default when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getMiniMaxModel()).toBe('MiniMax-Text-01');
    });
  });

  describe('getMiniMaxBaseUrl', () => {
    it('returns default when unset', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getMiniMaxBaseUrl()).toBe('https://api.minimax.chat/v1');
    });
  });

  describe('getFailoverCooldownLongMs', () => {
    it('returns 600000 by default', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getFailoverCooldownLongMs()).toBe(600_000);
    });

    it('returns configured value', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({ LLM_FAILOVER_COOLDOWN_LONG_MS: '300000' }),
      );
      expect(svc.getFailoverCooldownLongMs()).toBe(300_000);
    });

    it('returns default for invalid value', () => {
      const svc = new LlmExecutionConfigService(
        makeConfigService({ LLM_FAILOVER_COOLDOWN_LONG_MS: 'abc' }),
      );
      expect(svc.getFailoverCooldownLongMs()).toBe(600_000);
    });
  });

  describe('getFailoverCooldownShortMs', () => {
    it('returns 5000 by default', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getFailoverCooldownShortMs()).toBe(5_000);
    });
  });

  describe('getFailoverQuickRetryDelayMs', () => {
    it('returns 150 by default', () => {
      const svc = new LlmExecutionConfigService(makeConfigService({}));
      expect(svc.getFailoverQuickRetryDelayMs()).toBe(150);
    });
  });
});

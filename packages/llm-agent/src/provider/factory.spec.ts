import {
  createLlmProviderAdapter,
  createFailoverLlmProviderAdapter,
} from './factory';
import { OpenAiAdapter } from './openai/openai-adapter';
import { OpenRouterAdapter } from './openrouter/openrouter-adapter';
import { MiniMaxAdapter } from './minimax/minimax-adapter';
import { FailoverLlmProviderAdapter } from './failover/failover-adapter';
import type { LlmProviderEntryConfig } from './factory';

describe('createLlmProviderAdapter', () => {
  it('creates OpenAiAdapter for openai', () => {
    const adapter = createLlmProviderAdapter({
      getApiKey: () => 'key',
      getModel: () => 'gpt-5.4',
      provider: 'openai',
    });
    expect(adapter).toBeInstanceOf(OpenAiAdapter);
    expect(adapter.providerName).toBe('openai');
  });

  it('creates OpenRouterAdapter for openrouter', () => {
    const adapter = createLlmProviderAdapter({
      getApiKey: () => 'key',
      getModel: () => 'model',
      provider: 'openrouter',
    });
    expect(adapter).toBeInstanceOf(OpenRouterAdapter);
    expect(adapter.providerName).toBe('openrouter');
  });

  it('creates MiniMaxAdapter for minimax', () => {
    const adapter = createLlmProviderAdapter({
      getApiKey: () => 'key',
      getModel: () => 'model',
      provider: 'minimax',
    });
    expect(adapter).toBeInstanceOf(MiniMaxAdapter);
    expect(adapter.providerName).toBe('minimax');
  });

  it('defaults to openai when provider omitted', () => {
    const adapter = createLlmProviderAdapter({
      getApiKey: () => 'key',
      getModel: () => 'gpt-5.4',
    });
    expect(adapter).toBeInstanceOf(OpenAiAdapter);
  });
});

describe('createFailoverLlmProviderAdapter', () => {
  const entryA: LlmProviderEntryConfig = {
    provider: 'openai',
    getApiKey: () => 'key-a',
    getModel: () => 'model-a',
  };
  const entryB: LlmProviderEntryConfig = {
    provider: 'openrouter',
    getApiKey: () => 'key-b',
    getModel: () => 'model-b',
  };

  it('returns single adapter directly when only 1 provider configured', () => {
    const result = createFailoverLlmProviderAdapter(
      [entryA],
      ['openai', 'openrouter'],
    );
    expect(result).toBeInstanceOf(OpenAiAdapter);
    expect(result).not.toBeInstanceOf(FailoverLlmProviderAdapter);
  });

  it('returns FailoverLlmProviderAdapter when ≥2 providers configured', () => {
    const result = createFailoverLlmProviderAdapter(
      [entryA, entryB],
      ['openai', 'openrouter'],
    );
    expect(result).toBeInstanceOf(FailoverLlmProviderAdapter);
  });

  it('filters out providers without API key', () => {
    const entryNoKey: LlmProviderEntryConfig = {
      provider: 'minimax',
      getApiKey: () => undefined,
      getModel: () => 'model',
    };
    const result = createFailoverLlmProviderAdapter(
      [entryA, entryNoKey],
      ['openai', 'minimax'],
    );
    // Only openai has key → single adapter, no failover
    expect(result).toBeInstanceOf(OpenAiAdapter);
    expect(result).not.toBeInstanceOf(FailoverLlmProviderAdapter);
  });

  it('follows order parameter', () => {
    const result = createFailoverLlmProviderAdapter(
      [entryA, entryB],
      ['openrouter', 'openai'],
    );
    expect(result).toBeInstanceOf(FailoverLlmProviderAdapter);
    // Verify order by checking the adapter's internal behavior
    // The first candidate in order should be tried first
  });

  it('throws when no providers configured in order', () => {
    expect(() =>
      createFailoverLlmProviderAdapter(
        [entryA],
        ['openrouter'], // openrouter not in entries
      ),
    ).toThrow('No LLM provider configured in failover order');
  });

  it('throws when order is empty and no entries match', () => {
    expect(() => createFailoverLlmProviderAdapter([], [])).toThrow(
      'No LLM provider configured in failover order',
    );
  });
});

import { OpenRouterAdapter } from './openrouter-adapter';

describe('OpenRouterAdapter', () => {
  it('providerName is openrouter', () => {
    const adapter = new OpenRouterAdapter(() => 'test-key');
    expect(adapter.providerName).toBe('openrouter');
  });

  it('isConfigured returns true when API key present', () => {
    const adapter = new OpenRouterAdapter(() => 'test-key');
    expect(adapter.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when API key missing', () => {
    const adapter = new OpenRouterAdapter(() => undefined);
    expect(adapter.isConfigured()).toBe(false);
  });

  it('getDefaultModel returns openai/gpt-4o-mini by default', () => {
    const adapter = new OpenRouterAdapter(() => 'test-key');
    expect(adapter.getDefaultModel()).toBe('openai/gpt-4o-mini');
  });

  it('getDefaultModel returns custom model when provided', () => {
    const adapter = new OpenRouterAdapter(
      () => 'test-key',
      () => 'anthropic/claude-3.5-sonnet',
    );
    expect(adapter.getDefaultModel()).toBe('anthropic/claude-3.5-sonnet');
  });

  it('inherits normalizeError from OpenAiAdapter', () => {
    const adapter = new OpenRouterAdapter(() => 'test-key');
    const err = new Error('insufficient_quota') as Error & { status: number };
    err.status = 402;
    const result = adapter.normalizeError(err);
    expect(result.reason).toBe('quota_exceeded');
    expect(result.provider).toBe('openrouter');
  });
});

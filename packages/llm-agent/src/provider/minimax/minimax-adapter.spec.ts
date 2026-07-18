import { MiniMaxAdapter } from './minimax-adapter';

describe('MiniMaxAdapter', () => {
  it('providerName is minimax', () => {
    const adapter = new MiniMaxAdapter(() => 'test-key');
    expect(adapter.providerName).toBe('minimax');
  });

  it('isConfigured returns true when API key present', () => {
    const adapter = new MiniMaxAdapter(() => 'test-key');
    expect(adapter.isConfigured()).toBe(true);
  });

  it('isConfigured returns false when API key missing', () => {
    const adapter = new MiniMaxAdapter(() => undefined);
    expect(adapter.isConfigured()).toBe(false);
  });

  it('getDefaultModel returns MiniMax-Text-01 by default', () => {
    const adapter = new MiniMaxAdapter(() => 'test-key');
    expect(adapter.getDefaultModel()).toBe('MiniMax-Text-01');
  });

  it('getDefaultModel returns custom model when provided', () => {
    const adapter = new MiniMaxAdapter(
      () => 'test-key',
      () => 'custom-model',
    );
    expect(adapter.getDefaultModel()).toBe('custom-model');
  });

  it('inherits normalizeError from OpenAiAdapter', () => {
    const adapter = new MiniMaxAdapter(() => 'test-key');
    const err = new Error('insufficient credit') as Error & { status: number };
    err.status = 429;
    const result = adapter.normalizeError(err);
    expect(result.reason).toBe('quota_exceeded');
    expect(result.provider).toBe('minimax');
  });
});

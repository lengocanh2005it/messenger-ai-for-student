export class LlmAllProvidersExhaustedError extends Error {
  constructor(
    public readonly providers: string[],
    public readonly lastError: unknown,
  ) {
    super(`All LLM providers exhausted (tried: ${providers.join(', ')})`);
    this.name = 'LlmAllProvidersExhaustedError';
  }
}

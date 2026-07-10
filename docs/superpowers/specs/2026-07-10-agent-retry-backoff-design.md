# Agent LLM Retry with Jitter Backoff

**Date:** 2026-07-10
**Scope:** `packages/llm-agent` only

## Problem

Khi `adapter.chatWithTools()` fail với lỗi retryable (429 rate limit, 5xx server error), `LlmAgentService.reply()` throw ngay — user nhận lỗi trong khi chỉ cần chờ thêm vài trăm ms. `LlmProviderAdapter.isRetryableError()` đã tồn tại nhưng chưa được dùng trong agent loop.

## Solution

Private `withRetry<T>()` helper trong `LlmAgentService` wrap quanh mỗi `adapter.chatWithTools()` call.

### Retry logic

```
attempt 0 → fail (retryable) → wait jitter(100ms, 0)
attempt 1 → fail (retryable) → wait jitter(100ms, 1)
attempt 2 → fail (retryable) → wait jitter(100ms, 2)
attempt 3 → throw LlmRetryExhaustedError
```

**Jitter formula:** `Math.min(baseDelay * 2^attempt * (0.5 + Math.random() * 0.5), maxDelayMs)`
- attempt 0: 50–100ms
- attempt 1: 100–200ms
- attempt 2: 200–400ms
- Cap: 10_000ms

**Non-retryable errors:** throw immediately (auth errors, bad request, etc.)

### Config additions (`LlmAgentConfig`)

```ts
maxLlmRetries?: number;    // default 3
retryBaseDelayMs?: number; // default 100
```

### Error type

```ts
export class LlmRetryExhaustedError extends Error {
  constructor(public readonly attempts: number, cause: unknown) {
    super(`LLM call failed after ${attempts} attempts`);
    this.cause = cause;
  }
}
```

Exported từ `index.ts` để upstream có thể catch riêng.

### Logging

Mỗi retry: `logger.warn(LLM_RETRY attempt=${n}/${max} round=${round} reason=... delay=${ms}ms)`

## Files Changed

| File | Change |
|------|--------|
| `packages/llm-agent/src/types.ts` | Add `maxLlmRetries`, `retryBaseDelayMs` |
| `packages/llm-agent/src/agent.service.ts` | Add `withRetry()`, `LlmRetryExhaustedError`, wrap LLM call |
| `packages/llm-agent/src/index.ts` | Export `LlmRetryExhaustedError` |
| `packages/llm-agent/src/agent.service.spec.ts` | Tests: retry on retryable, no retry on non-retryable, exhausted throws |

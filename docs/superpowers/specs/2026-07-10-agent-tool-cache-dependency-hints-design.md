# Agent Tool Result Cache + Tool Dependency Hints

**Date:** 2026-07-10
**Scope:** `packages/llm-agent` only — framework-agnostic, no app-layer changes

## Problem

1. **Cross-turn tool redundancy** — Mỗi conversation turn, agent fetch lại dữ liệu từ tool dù user chưa làm gì thay đổi (goals, lịch học). Gây latency không cần thiết và tốn API calls.
2. **Tool ordering errors** — LLM đôi khi gọi `reschedule_study_session` mà không có `calendarId` (phải lấy từ `list_study_calendar_entries` trước). Tool schema không có gì để LLM biết dependency này.

## Solution

### A3 — Tool Result Cache (TTL-based in-memory)

**Port interface** (`tool-cache/tool-result-cache.port.ts`):
```ts
export interface ToolResultCachePort {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown, ttlMs: number): void;
  invalidate(key: string): void;
}
```

**Cache key format:** `${externalUserId}:${toolName}:${stableHash(argsJson)}`
- `stableHash` = djb2 hash của sorted JSON string (no external dependency)
- Phân biệt `get_upcoming_study_sessions(limit=5)` vs `limit=10`

**Default implementation** (`tool-cache/in-memory-tool-result-cache.ts`):
- Plain `Map<string, { value: unknown; expiresAt: number }>`
- Lazy eviction on `get()` — không cần setInterval
- Default TTL: 5 phút (`300_000` ms), configurable via `LlmAgentConfig.toolCacheTtlMs`

**Agent loop integration** (`agent.service.ts`):
```
tool call received
→ build cache key
→ cache.get(key) hit? → use cached, push tool message, skip execute
→ miss → execute() → on success: cache.set(key, result, ttlMs)
         → on error: no cache (always retry errors)
→ special: after reschedule_study_session succeeds → invalidate list_study_calendar_entries keys for this user
```

**Cache is optional:** `LlmAgentPorts.toolResultCache?: ToolResultCachePort` — nếu không inject thì agent hoạt động như cũ, không break existing code.

**Config addition** (`types.ts`):
```ts
interface LlmAgentConfig {
  // ...existing...
  toolCacheTtlMs?: number; // default 300_000 (5 min)
}
```

### C1 — Tool Dependency Hints in Descriptions

Sửa `agent.tools.ts` — chỉ 2 tool descriptions:

**`reschedule_study_session`:**
> Thêm vào đầu description: *"Luôn gọi `list_study_calendar_entries` trước để lấy `calendarId`."*

**`get_upcoming_study_sessions`:**
> Thêm vào cuối description: *"Dùng để hiển thị lịch. Nếu cần `calendarId` để đổi lịch, dùng `list_study_calendar_entries` thay thế."*

## Files Changed

| File | Change |
|------|--------|
| `packages/llm-agent/src/tool-cache/tool-result-cache.port.ts` | New — port interface + noop impl |
| `packages/llm-agent/src/tool-cache/in-memory-tool-result-cache.ts` | New — Map-based impl |
| `packages/llm-agent/src/ports.ts` | Add `toolResultCache?: ToolResultCachePort` to `LlmAgentPorts` |
| `packages/llm-agent/src/types.ts` | Add `toolCacheTtlMs?: number` to `LlmAgentConfig` |
| `packages/llm-agent/src/agent.service.ts` | Cache lookup/set/invalidate in tool execution block |
| `packages/llm-agent/src/agent.tools.ts` | 2 description updates |
| `packages/llm-agent/src/index.ts` | Export new cache types |
| `packages/llm-agent/src/agent.service.spec.ts` | Tests for cache hit/miss/invalidation |

## Constraints

- `packages/llm-agent` không import NestJS — cache implementation là plain class
- Cache invalidation chỉ scope theo `externalUserId` — không share giữa users
- Error responses (`{ ok: false }`) không được cache
- `reschedule_study_session` là tool duy nhất trigger invalidation (vì nó mutate calendar data)

## Testing

- Cache hit: tool không được gọi lần 2 trong cùng user + same args
- Cache miss: tool được gọi khi TTL expired
- Invalidation: sau `reschedule_study_session`, `list_study_calendar_entries` bị evict
- No-cache path: agent hoạt động bình thường khi `toolResultCache` không inject
- Error không cache: tool error → next call vẫn execute

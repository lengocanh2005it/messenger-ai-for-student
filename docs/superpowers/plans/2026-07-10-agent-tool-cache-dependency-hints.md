# Agent Tool Result Cache + Dependency Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm TTL-based in-memory tool result cache vào `LlmAgentService` và cập nhật tool descriptions với dependency hints.

**Architecture:** `ToolResultCachePort` interface (optional) được inject vào `LlmAgentPorts`. `InMemoryToolResultCache` là plain Map-based implementation trong package. Agent loop check cache trước khi execute tool, set sau khi success, invalidate `list_study_calendar_entries` sau khi `reschedule_study_session` thành công.

**Tech Stack:** TypeScript, plain Map (no external deps), Jest

## Global Constraints

- `packages/llm-agent` không import NestJS hoặc TypeORM — chỉ dùng built-in JS
- Cache là optional — nếu không inject `toolResultCache` thì agent hoạt động như cũ
- Error results (`{ ok: false }`) không được cache
- Cache invalidation chỉ scope theo `externalUserId`
- Chạy tests: `npx turbo run test --filter=@wispace/llm-agent`
- Chạy full verify: `npx turbo run lint build test --filter=@wispace/messenger-bot... --filter=@wispace/llm-agent`

---

### Task 1: ToolResultCachePort + InMemoryToolResultCache

**Files:**
- Create: `packages/llm-agent/src/tool-cache/tool-result-cache.port.ts`
- Create: `packages/llm-agent/src/tool-cache/in-memory-tool-result-cache.ts`
- Create: `packages/llm-agent/src/tool-cache/in-memory-tool-result-cache.spec.ts`

**Interfaces:**
- Produces:
  - `ToolResultCachePort` interface với `get(key: string): unknown | undefined`, `set(key: string, value: unknown, ttlMs: number): void`, `invalidate(key: string): void`, `invalidatePrefix(prefix: string): void`
  - `InMemoryToolResultCache` class implementing `ToolResultCachePort`
  - `NOOP_TOOL_RESULT_CACHE: ToolResultCachePort` (no-op cho khi không inject)

- [ ] **Step 1: Viết failing tests**

Tạo file `packages/llm-agent/src/tool-cache/in-memory-tool-result-cache.spec.ts`:

```ts
import { InMemoryToolResultCache } from './in-memory-tool-result-cache';

describe('InMemoryToolResultCache', () => {
  it('returns undefined for cache miss', () => {
    const cache = new InMemoryToolResultCache();
    expect(cache.get('missing-key')).toBeUndefined();
  });

  it('returns value after set', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('key', { data: 'test' }, 60_000);
    expect(cache.get('key')).toEqual({ data: 'test' });
  });

  it('returns undefined after TTL expires', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('key', { data: 'test' }, -1); // already expired
    expect(cache.get('key')).toBeUndefined();
  });

  it('invalidate removes specific key', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('key-a', 'a', 60_000);
    cache.set('key-b', 'b', 60_000);
    cache.invalidate('key-a');
    expect(cache.get('key-a')).toBeUndefined();
    expect(cache.get('key-b')).toBe('b');
  });

  it('invalidatePrefix removes all keys starting with prefix', () => {
    const cache = new InMemoryToolResultCache();
    cache.set('user123:list_study_calendar_entries:abc', 'x', 60_000);
    cache.set('user123:list_study_calendar_entries:def', 'y', 60_000);
    cache.set('user123:get_user_goals:ghi', 'z', 60_000);
    cache.invalidatePrefix('user123:list_study_calendar_entries:');
    expect(cache.get('user123:list_study_calendar_entries:abc')).toBeUndefined();
    expect(cache.get('user123:list_study_calendar_entries:def')).toBeUndefined();
    expect(cache.get('user123:get_user_goals:ghi')).toBe('z');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

```bash
npx turbo run test --filter=@wispace/llm-agent
```

Expected: FAIL — `Cannot find module './in-memory-tool-result-cache'`

- [ ] **Step 3: Tạo port interface**

Tạo `packages/llm-agent/src/tool-cache/tool-result-cache.port.ts`:

```ts
export interface ToolResultCachePort {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown, ttlMs: number): void;
  invalidate(key: string): void;
  /** Removes all keys whose string starts with the given prefix. */
  invalidatePrefix(prefix: string): void;
}

export const NOOP_TOOL_RESULT_CACHE: ToolResultCachePort = {
  get: () => undefined,
  set: () => undefined,
  invalidate: () => undefined,
  invalidatePrefix: () => undefined,
};
```

- [ ] **Step 4: Implement InMemoryToolResultCache**

Tạo `packages/llm-agent/src/tool-cache/in-memory-tool-result-cache.ts`:

```ts
import type { ToolResultCachePort } from './tool-result-cache.port';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class InMemoryToolResultCache implements ToolResultCachePort {
  private readonly store = new Map<string, CacheEntry>();

  get(key: string): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}
```

- [ ] **Step 5: Chạy test để xác nhận pass**

```bash
npx turbo run test --filter=@wispace/llm-agent
```

Expected: tất cả tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/llm-agent/src/tool-cache/
git commit -m "feat(llm-agent): add ToolResultCachePort + InMemoryToolResultCache"
```

---

### Task 2: Wire cache vào LlmAgentConfig, LlmAgentPorts, agent.service.ts

**Files:**
- Modify: `packages/llm-agent/src/types.ts`
- Modify: `packages/llm-agent/src/agent.service.ts`
- Modify: `packages/llm-agent/src/agent.service.spec.ts`

**Interfaces:**
- Consumes:
  - `ToolResultCachePort` từ `./tool-cache/tool-result-cache.port`
  - `NOOP_TOOL_RESULT_CACHE` từ `./tool-cache/tool-result-cache.port`
- Produces:
  - `LlmAgentConfig.toolCacheTtlMs?: number`
  - `LlmAgentPorts.toolResultCache?: ToolResultCachePort`
  - Cache key format: `${externalUserId}:${toolName}:${stableHash(argsJson)}`
  - Invalidation sau `reschedule_study_session` thành công

- [ ] **Step 1: Thêm `toolCacheTtlMs` vào `LlmAgentConfig`**

Sửa `packages/llm-agent/src/types.ts`:

```ts
export interface LlmAgentConfig {
  /** @deprecated Use adapter.isConfigured() instead. Kept for backward compat. */
  apiKey?: string;
  model?: string;
  maxToolRounds?: number;
  maxContextChars?: number;
  /** TTL for tool result cache in ms. Default: 300_000 (5 min). 0 = disable cache. */
  toolCacheTtlMs?: number;
}
```

- [ ] **Step 2: Thêm `toolResultCache` vào `LlmAgentPorts` trong `agent.service.ts`**

Thêm import vào đầu `packages/llm-agent/src/agent.service.ts`:

```ts
import type { ToolResultCachePort } from './tool-cache/tool-result-cache.port';
import { NOOP_TOOL_RESULT_CACHE } from './tool-cache/tool-result-cache.port';
```

Sửa `LlmAgentPorts` interface trong cùng file:

```ts
export interface LlmAgentPorts<TToolContext> {
  llmExecution: LlmExecutionPort;
  usageRecorder: LlmUsageRecorderPort;
  safetyEvents: LlmSafetyEventPort;
  toolExecutor: ToolExecutorPort<TToolContext>;
  adapter: LlmProviderAdapter;
  toolResultCache?: ToolResultCachePort;
  metrics?: AgentMetricsPort;
  logger?: {
    warn: (message: string) => void;
    debug: (message: string) => void;
  };
}
```

- [ ] **Step 3: Thêm `stableHash` helper vào `agent.service.ts`**

Thêm function sau các `const` khai báo ở đầu file (sau `NOOP_LOGGER`):

```ts
/** djb2 hash của argsJson string — đủ để phân biệt tool args khác nhau. */
function stableHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // convert to unsigned 32-bit
  }
  return hash.toString(36);
}

const DEFAULT_TOOL_CACHE_TTL_MS = 300_000; // 5 minutes
const RESCHEDULE_TOOL = 'reschedule_study_session';
const CALENDAR_TOOL = 'list_study_calendar_entries';
```

- [ ] **Step 4: Thêm cache logic vào tool execution block trong `reply()`**

Trong method `reply()`, tìm đoạn `const toolResults = await Promise.all(` và thay thế toàn bộ block đó:

```ts
      const cache = this.ports.toolResultCache ?? NOOP_TOOL_RESULT_CACHE;
      const cacheTtlMs = this.getToolCacheTtlMs();

      // Execute all tool calls in this round in parallel
      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          const toolName = toolCall.name;
          toolsCalledThisTurn.add(toolName);
          const argsJson = toolCall.arguments || '{}';
          const cacheKey = `${input.externalUserId}:${toolName}:${stableHash(argsJson)}`;

          let content: string;
          try {
            // Cache lookup
            const cached = cacheTtlMs > 0 ? cache.get(cacheKey) : undefined;
            let result: unknown;
            if (cached !== undefined) {
              logger.debug(
                `Tool cache hit externalUserId=${input.externalUserId} tool=${toolName}`,
              );
              result = cached;
            } else {
              result = await metrics.timeTool(toolName, () =>
                this.ports.toolExecutor.execute(toolName, argsJson, toolContext),
              );
              // Cache successful result; invalidate calendar after reschedule
              if (cacheTtlMs > 0) {
                cache.set(cacheKey, result, cacheTtlMs);
                if (toolName === RESCHEDULE_TOOL) {
                  cache.invalidatePrefix(
                    `${input.externalUserId}:${CALENDAR_TOOL}:`,
                  );
                  logger.debug(
                    `Cache invalidated ${CALENDAR_TOOL} for externalUserId=${input.externalUserId} after reschedule`,
                  );
                }
              }
            }
            const raw = JSON.stringify({ ok: true, data: result });
            const sanitized = sanitizeToolResultContent(raw);
            if (sanitized.wasSanitized) {
              logger.warn(
                `Tool result sanitized externalUserId=${input.externalUserId} tool=${toolName} reason=${sanitized.reason}`,
              );
            }
            content = sanitized.content;
          } catch (err) {
            const message =
              err instanceof Error ? err.message : 'unknown error';
            logger.warn(
              `Tool execution failed externalUserId=${input.externalUserId} tool=${toolName} error=${message}`,
            );
            content = JSON.stringify({ ok: false, error: message });
          }

          return { toolCallId: toolCall.id, content };
        }),
      );
```

- [ ] **Step 5: Thêm `getToolCacheTtlMs()` private method vào class**

Thêm sau `getMaxToolRounds()`:

```ts
  private getToolCacheTtlMs(): number {
    const v = this.config.toolCacheTtlMs;
    if (v === 0) return 0; // explicit disable
    if (v && Number.isFinite(v) && v > 0) return Math.floor(v);
    return DEFAULT_TOOL_CACHE_TTL_MS;
  }
```

- [ ] **Step 6: Viết tests cho cache behavior**

Thêm vào cuối `packages/llm-agent/src/agent.service.spec.ts`:

```ts
  describe('reply() — tool result cache', () => {
    function buildServiceWithCache(
      overrides: {
        execute?: jest.Mock;
        adapter?: LlmProviderAdapter;
        toolCacheTtlMs?: number;
      } = {},
    ) {
      const usageRecorder = { recordFromCompletion: jest.fn() };
      const safetyEvents = { recordGroundingWarning: jest.fn() };
      const llmExecution = {
        run: jest.fn().mockImplementation((_fn: () => Promise<unknown>) => _fn()),
      };
      const toolExecutor = {
        execute: overrides.execute ?? jest.fn().mockResolvedValue({ ok: true }),
      };
      const toolResultCache = {
        get: jest.fn().mockReturnValue(undefined),
        set: jest.fn(),
        invalidate: jest.fn(),
        invalidatePrefix: jest.fn(),
      };

      const ports: LlmAgentPorts<StubToolContext> = {
        llmExecution,
        usageRecorder,
        safetyEvents,
        toolExecutor,
        adapter: overrides.adapter ?? makeAdapter([makeTextResponse('stub')]),
        metrics: NOOP_METRICS_PORT,
        logger: { warn: jest.fn(), debug: jest.fn() },
        toolResultCache,
      };

      const service = new LlmAgentService<StubToolContext>(
        { toolCacheTtlMs: overrides.toolCacheTtlMs ?? 60_000 },
        ports,
      );

      return { service, toolExecutor, toolResultCache };
    }

    it('skips execute on cache hit and reuses cached result', async () => {
      const cachedData = { goals: 'cached' };
      const toolResponse = makeToolCallResponse('get_user_goals');
      const textResponse = makeTextResponse('Kết quả từ cache.');
      const adapter = makeAdapter([toolResponse, textResponse]);
      const execute = jest.fn();

      const { service, toolResultCache } = buildServiceWithCache({ adapter, execute });
      toolResultCache.get.mockReturnValue(cachedData);

      await service.reply(BASE_INPUT, TOOL_CONTEXT);

      expect(execute).not.toHaveBeenCalled();
    });

    it('calls execute on cache miss and stores result', async () => {
      const toolResponse = makeToolCallResponse('get_user_goals');
      const textResponse = makeTextResponse('Kết quả.');
      const adapter = makeAdapter([toolResponse, textResponse]);
      const execute = jest.fn().mockResolvedValue({ goals: [] });

      const { service, toolResultCache } = buildServiceWithCache({ adapter, execute });
      toolResultCache.get.mockReturnValue(undefined);

      await service.reply(BASE_INPUT, TOOL_CONTEXT);

      expect(execute).toHaveBeenCalledTimes(1);
      expect(toolResultCache.set).toHaveBeenCalledWith(
        expect.stringContaining('get_user_goals'),
        { goals: [] },
        60_000,
      );
    });

    it('invalidates list_study_calendar_entries after reschedule_study_session', async () => {
      const toolResponse = makeToolCallResponse('reschedule_study_session', '{"calendarId":1,"schedulingMode":"default_next_day_same_time"}');
      const textResponse = makeTextResponse('Đã đổi lịch.');
      const adapter = makeAdapter([toolResponse, textResponse]);
      const execute = jest.fn().mockResolvedValue({ success: true });

      const { service, toolResultCache } = buildServiceWithCache({ adapter, execute });
      toolResultCache.get.mockReturnValue(undefined);

      await service.reply(BASE_INPUT, TOOL_CONTEXT);

      expect(toolResultCache.invalidatePrefix).toHaveBeenCalledWith(
        `${BASE_INPUT.externalUserId}:list_study_calendar_entries:`,
      );
    });

    it('does not cache error results', async () => {
      const toolResponse = makeToolCallResponse('get_user_goals');
      const textResponse = makeTextResponse('Lỗi.');
      const adapter = makeAdapter([toolResponse, textResponse]);
      const execute = jest.fn().mockRejectedValue(new Error('timeout'));

      const { service, toolResultCache } = buildServiceWithCache({ adapter, execute });
      toolResultCache.get.mockReturnValue(undefined);

      await service.reply(BASE_INPUT, TOOL_CONTEXT);

      expect(toolResultCache.set).not.toHaveBeenCalled();
    });

    it('skips cache entirely when toolCacheTtlMs is 0', async () => {
      const toolResponse = makeToolCallResponse('get_user_goals');
      const textResponse = makeTextResponse('Kết quả.');
      const adapter = makeAdapter([toolResponse, textResponse]);
      const execute = jest.fn().mockResolvedValue({ goals: [] });

      const { service, toolResultCache } = buildServiceWithCache({
        adapter,
        execute,
        toolCacheTtlMs: 0,
      });

      await service.reply(BASE_INPUT, TOOL_CONTEXT);

      expect(toolResultCache.get).not.toHaveBeenCalled();
      expect(toolResultCache.set).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 7: Chạy tests**

```bash
npx turbo run test --filter=@wispace/llm-agent
```

Expected: tất cả tests PASS

- [ ] **Step 8: Commit**

```bash
git add packages/llm-agent/src/types.ts packages/llm-agent/src/agent.service.ts packages/llm-agent/src/agent.service.spec.ts
git commit -m "feat(llm-agent): wire tool result cache into agent loop"
```

---

### Task 3: Export cache types từ index.ts

**Files:**
- Modify: `packages/llm-agent/src/index.ts`

**Interfaces:**
- Consumes: `ToolResultCachePort`, `NOOP_TOOL_RESULT_CACHE`, `InMemoryToolResultCache` từ Task 1
- Produces: public API của package export các types trên

- [ ] **Step 1: Thêm exports vào `packages/llm-agent/src/index.ts`**

Thêm vào cuối file (sau block `// --- Provider abstraction (new) ---`):

```ts
// --- Tool result cache ---
export type { ToolResultCachePort } from './tool-cache/tool-result-cache.port';
export { NOOP_TOOL_RESULT_CACHE } from './tool-cache/tool-result-cache.port';
export { InMemoryToolResultCache } from './tool-cache/in-memory-tool-result-cache';
```

- [ ] **Step 2: Build để verify exports compile**

```bash
npx turbo run build --filter=@wispace/llm-agent
```

Expected: build thành công, không có type errors

- [ ] **Step 3: Commit**

```bash
git add packages/llm-agent/src/index.ts
git commit -m "feat(llm-agent): export ToolResultCachePort and InMemoryToolResultCache"
```

---

### Task 4: Tool dependency hints (C1)

**Files:**
- Modify: `packages/llm-agent/src/agent.tools.ts`

**Interfaces:**
- Không thay đổi interface — chỉ update `description` string của 2 tools

- [ ] **Step 1: Update description của `reschedule_study_session`**

Trong `packages/llm-agent/src/agent.tools.ts`, tìm tool `reschedule_study_session` và sửa `description`:

```ts
  {
    name: 'reschedule_study_session',
    description:
      'Luôn gọi `list_study_calendar_entries` trước để lấy `calendarId`. Sau đó chuẩn bị dời buổi học (gửi nút xác nhận cho học viên; chỉ thực hiện sau khi bấm Xác nhận). default_next_day_same_time = cùng giờ, +1 ngày so với buổi đang dời (buổi ngày mai → ngày kia). explicit khi học viên nêu rõ ngày/giờ mới.',
```

- [ ] **Step 2: Update description của `get_upcoming_study_sessions`**

Tìm tool `get_upcoming_study_sessions` và sửa `description`:

```ts
  {
    name: 'get_upcoming_study_sessions',
    description:
      'Danh sách buổi học IELTS Writing sắp tới từ lịch UserCalendar của học viên. Dùng để hiển thị lịch. Nếu cần calendarId để đổi lịch, dùng list_study_calendar_entries thay thế.',
```

- [ ] **Step 3: Chạy full verify**

```bash
npx turbo run lint build test --filter=@wispace/messenger-bot... --filter=@wispace/llm-agent
```

Expected: tất cả tasks PASS

- [ ] **Step 4: Commit**

```bash
git add packages/llm-agent/src/agent.tools.ts
git commit -m "feat(llm-agent): add dependency hints to tool descriptions (C1)"
```

---

## Self-Review

**Spec coverage:**
- ✅ `ToolResultCachePort` interface với `get/set/invalidate/invalidatePrefix` — Task 1
- ✅ `InMemoryToolResultCache` Map-based implementation — Task 1
- ✅ `NOOP_TOOL_RESULT_CACHE` no-op — Task 1
- ✅ Cache key format `${externalUserId}:${toolName}:${stableHash(argsJson)}` — Task 2
- ✅ `toolCacheTtlMs` configurable, default 5 min — Task 2
- ✅ Cache check trước execute, set sau success — Task 2
- ✅ Error results không cache — Task 2 + test
- ✅ Invalidate `list_study_calendar_entries` sau `reschedule_study_session` — Task 2
- ✅ Cache optional (agent works without it) — `NOOP_TOOL_RESULT_CACHE` fallback
- ✅ Export public API — Task 3
- ✅ Dependency hints `reschedule_study_session` + `get_upcoming_study_sessions` — Task 4
- ✅ Full verify cuối cùng — Task 4 Step 3

# Multi-LLM Provider Failover (OpenRouter + MiniMax)

**Date:** 2026-07-18
**Scope:** `packages/llm-agent` (provider layer) + wiring in `apps/messenger-bot`, `apps/discord-bot`

## Problem

Hiện tại mỗi app chỉ cấu hình **một** `LlmProviderAdapter` tại boot time (`LLM_PROVIDER` env → `createLlmProviderAdapter()`, xem ADR [0006](../../adr/0006-llm-provider-adapter.md)). Khi provider đó lỗi runtime (hết credit, rate limit, 5xx) thì:

1. `LlmAgentService.withRetry()` (packages/llm-agent) và/hoặc `LlmExecutionService.runWithRetry()` (messenger-bot) hoặc `DiscordAgentService.runWithRetry()` (discord-bot) **retry cùng 1 provider** với exponential backoff (mặc định 3–4 lần).
2. Nếu lỗi là **hết credit / quota** thì retry chắc chắn fail lại — chỉ tốn thời gian chờ (log thực tế: `LLM call failed after 4 attempts` — user chờ ~vài giây rồi mới nhận fallback message, xem [chat fallback thread](../../../CLAUDE.md) trước đó trong phiên làm việc này).
3. Không có provider thứ 2 nào được thử — toàn bộ tính năng chat/report/reminder chết cứng cho tới khi người vận hành nạp credit hoặc đổi `.env` + restart.
4. **Bug phát hiện thêm**: `apps/discord-bot/src/modules/discord-chat/discord-chat.module.ts` hardcode `new OpenAiAdapter(...)` trực tiếp, **không** đi qua `createLlmProviderAdapter()` — Discord bot hiện không tôn trọng `LLM_PROVIDER` env dù Messenger bot có. Cần sửa cùng lúc.

## Goals

- Thêm 2 adapter mới: **OpenRouter**, **MiniMax** — cả hai đều expose API dạng OpenAI-compatible (chat completions), nên tái dùng `OpenAiAdapter` làm base class giống `OpenAiCompatibleAdapter` hiện có.
- Khi nhiều provider được cấu hình, **failover tự động**: provider nào lỗi (bất kể lý do — rate limit, 5xx, hết credit, auth) → thử ngay provider tiếp theo trong danh sách, **không** chờ backoff/retry trên provider đang lỗi.
- Không đổi hành vi khi chỉ 1 provider được cấu hình (giữ tương thích ngược 100%, không tăng độ trễ/độ phức tạp cho case hiện tại).
- Không đổi bất kỳ consumer nào (`LlmAgentService`, `LlmExecutionService`, `StudyReminderService`, `StudentReportService`, `MessengerAgentService`, `DiscordAgentService`) — tất cả đều inject qua token `LLM_PROVIDER_ADAPTER` : interface `LlmProviderAdapter` không đổi shape, chỉ có thêm 1 implementation mới (`FailoverLlmProviderAdapter`).
- Sửa bug Discord bot hardcode OpenAI.

## Non-goals

- Không làm streaming failover giữa chừng 1 response đang stream dở (`chatStream`) — nếu stream đã bắt đầu và lỗi giữa chừng, coi là lỗi của lượt đó (failover áp dụng cho lượt *tiếp theo*, không resume stream sang provider khác giữa chừng — quá phức tạp, rủi ro trả lời nửa vời từ 2 model khác nhau ghép lại).
- Không thêm retry nhiều "vòng" qua toàn bộ danh sách provider (thử A→B→C rồi quay lại A lần nữa). Một lượt failover chỉ đi qua danh sách **đúng 1 lần**. Nếu tất cả đều lỗi → throw, consumer hiện có (chat gateway/dispatch service) đã có fallback message sẵn.
- Không thêm Anthropic/Gemini trong phạm vi này (ADR-0006 Phase 4 có nhắc nhưng user chỉ yêu cầu OpenRouter + MiniMax lần này).

## Design

### 1. Error classification — thêm `reason: 'quota_exceeded'` + policy retry-trước-khi-failover

`packages/llm-agent/src/provider/types.ts` — `LlmProviderError.reason` hiện có `'rate_limit' | 'server_error' | 'auth' | 'unknown'`. Thêm `'quota_exceeded'`.

`OpenAiAdapter.normalizeError()` (base class dùng chung cho OpenAI/OpenAI-compatible/OpenRouter/MiniMax) nhận diện quota-exhausted qua:
- HTTP status `402` (Payment Required — OpenRouter dùng mã này khi hết credit).
- HTTP status `429` **và** body/message chứa `insufficient_quota` / `insufficient credit` / `insufficient balance` (OpenAI trả `insufficient_quota` trong `error.code`; MiniMax trả `base_resp.status_code` riêng — **cần verify khi implement**, xem Open Questions).

**Policy — không phải mọi lỗi đều đối xử như nhau.** Mục tiêu là failover nhanh nhất có thể, nhưng vẫn tha cho những lỗi thoáng qua (network hiccup, burst rate-limit) một cơ hội rẻ trước khi bỏ hẳn provider đó cho lượt này:

| `reason` | Policy | Số lần thử **trên chính provider đó** trước khi failover | Cooldown sau khi bỏ cuộc với provider này |
|----------|--------|------------------------------------------------------------|---------------------------------------------|
| `quota_exceeded` | **FAST_FAIL** — failover ngay, không retry | 1 (không retry) | Dài (`FAILOVER_COOLDOWN_LONG_MS`, mặc định 10 phút) — hết credit không tự hồi trong vài giây |
| `auth` | **FAST_FAIL** | 1 | Dài — thường là lỗi cấu hình (sai key), cần người vận hành sửa, tự retry vô ích |
| `rate_limit` | **QUICK_RETRY** | 2 (gốc + 1 retry, delay cố định ngắn, **không** exponential) | Ngắn (`FAILOVER_COOLDOWN_SHORT_MS`, mặc định 5 giây) — burst rate-limit thường tự hết rất nhanh |
| `server_error` | **QUICK_RETRY** | 2 | Ngắn |
| `unknown` | **QUICK_RETRY** | 2 | Ngắn — an toàn, không chắc bản chất lỗi nên vẫn cho 1 cơ hội trước khi bỏ qua |

Delay cho `QUICK_RETRY` là **hằng số nhỏ cố định** (mặc định 150ms, không phải exponential backoff của `LlmAgentService.withRetry` cũ) — mục tiêu là bắt được lỗi thoáng qua trong tối đa vài trăm ms, không phải "chờ cho chắc" như retry cũ (đó chính là cái gây độ trễ lớn user đang thấy).

`isRetryableError()` ở từng adapter con **giữ nguyên** (dùng cho các nơi gọi trực tiếp 1 adapter, không qua Failover — case chỉ có 1 provider configured). Ở `FailoverLlmProviderAdapter`, quyết định retry-nhanh-hay-fast-fail nằm trong `runFailover()`, dựa trên `candidate.normalizeError(err).reason` — **không** phụ thuộc `isRetryableError()` (vì `isRetryableError()` chỉ trả boolean, không đủ để phân biệt "đáng thử lại nhanh" và "bỏ hẳn ngay").

### 2. `OpenRouterAdapter` / `MiniMaxAdapter`

`packages/llm-agent/src/provider/openrouter/openrouter-adapter.ts`:

```ts
export class OpenRouterAdapter extends OpenAiAdapter {
  constructor(getApiKey, getModel, getBaseUrl) {
    super(
      getApiKey,
      getModel ?? (() => DEFAULT_OPENROUTER_MODEL),
      getBaseUrl ?? (() => 'https://openrouter.ai/api/v1'),
      'openrouter',
    );
  }
}
```

`packages/llm-agent/src/provider/minimax/minimax-adapter.ts` — cùng pattern, `providerName: 'minimax'`, base URL mặc định trỏ MiniMax OpenAI-compatible endpoint.

Cả hai kế thừa toàn bộ logic `chatWithTools`/`chatStream`/`generateJson` từ `OpenAiAdapter` (dùng chung OpenAI SDK client trỏ `baseURL` khác) — đúng pattern `OpenAiCompatibleAdapter` đã có, chỉ khác default model/baseURL/providerName.

### 3. `FailoverLlmProviderAdapter` — greedy pick + circuit breaker

**Thuật toán chọn provider**: greedy, đi theo đúng thứ tự ưu tiên đã cấu hình (`order`), bóc **candidate khỏe đầu tiên** trong tập còn lại — đúng như yêu cầu, không có gì phức tạp hơn cần thiết (không cần load-balancing/weighted-routing vì mục tiêu là *đúng và nhanh*, không phải phân phối tải đều). Cái làm cho nó **nhanh** không phải thuật toán chọn (vốn đã O(k) với k = số provider, k rất nhỏ ~2-4), mà là **circuit breaker in-memory** để không lặp lại network round-trip tới 1 provider đã biết chắc đang chết:

```ts
interface CircuitState {
  healthyAgainAt: number; // epoch ms — 0 nghĩa là luôn khỏe
}

export class FailoverLlmProviderAdapter implements LlmProviderAdapter {
  readonly providerName = 'failover';
  private readonly circuit = new Map<string, CircuitState>(); // key = provider.providerName

  constructor(
    private readonly candidates: LlmProviderAdapter[], // đã lọc isConfigured() từ factory
    private readonly logger?: { warn: (msg: string) => void },
    private readonly clock: () => number = Date.now, // inject cho test
  ) {}

  isConfigured(): boolean {
    return this.candidates.length > 0;
  }

  getDefaultModel(): string {
    return this.candidates[0].getDefaultModel();
  }

  async generateJson(request) {
    return this.runFailover((c, req) => c.generateJson(req), request);
  }
  async chatWithTools(request) {
    return this.runFailover((c, req) => c.chatWithTools(req), request);
  }
  chatStream(request) {
    // Không failover giữa chừng 1 stream (Non-goals) — nhưng vẫn tôn trọng circuit
    // breaker: bỏ qua candidate đang trong cooldown, chọn candidate khỏe đầu tiên.
    return this.pickHealthy()[0].chatStream(request);
  }

  isRetryableError(): boolean {
    return false; // đã tự failover/quick-retry nội bộ — outer retry loop không cần lặp lại.
  }
  isRateLimitError(error): boolean {
    return this.candidates[0].isRateLimitError(error);
  }
  normalizeError(error): LlmProviderError {
    return this.candidates[0].normalizeError(error);
  }

  /** Candidate chưa hết cooldown, theo đúng thứ tự ưu tiên gốc. */
  private pickHealthy(): LlmProviderAdapter[] {
    const now = this.clock();
    const healthy = this.candidates.filter(
      (c) => (this.circuit.get(c.providerName)?.healthyAgainAt ?? 0) <= now,
    );
    return healthy.length > 0 ? healthy : this.candidates; // tất cả đang cooldown → vẫn thử lại candidate đầu, còn hơn throw ngay
  }

  private async runFailover<Req, Res>(
    call: (c: LlmProviderAdapter, req: Req) => Promise<Res>,
    request: Req & { model?: string },
  ): Promise<Res> {
    const ordered = this.pickHealthy();
    let lastError: unknown;

    for (const candidate of ordered) {
      const req = { ...request, model: candidate.getDefaultModel() }; // model không portable

      for (let attempt = 1; attempt <= this.maxAttemptsFor(candidate, lastError); attempt++) {
        try {
          const result = await call(candidate, req);
          this.circuit.delete(candidate.providerName); // thành công → reset circuit
          return result;
        } catch (err) {
          lastError = err;
          const { reason } = candidate.normalizeError(err);
          const isFastFail = reason === 'quota_exceeded' || reason === 'auth';

          if (isFastFail || attempt === this.maxAttemptsFor(candidate, err)) {
            this.circuit.set(candidate.providerName, {
              healthyAgainAt:
                this.clock() + (isFastFail ? COOLDOWN_LONG_MS : COOLDOWN_SHORT_MS),
            });
            this.logger?.warn(
              `LLM_FAILOVER provider=${candidate.providerName} reason=${reason} attempt=${attempt} — moving to next candidate`,
            );
            break; // bỏ provider này, sang candidate tiếp theo trong vòng for ngoài
          }

          // QUICK_RETRY: delay cố định ngắn, không exponential.
          await sleep(QUICK_RETRY_DELAY_MS);
        }
      }
    }

    throw new LlmAllProvidersExhaustedError(ordered.map((c) => c.providerName), lastError);
  }

  /** rate_limit/server_error/unknown = QUICK_RETRY (2 lần); quota_exceeded/auth = 1 lần (fast-fail). */
  private maxAttemptsFor(candidate: LlmProviderAdapter, lastError: unknown): number {
    if (!lastError) return 2; // chưa biết reason (lần thử đầu) → cho phép tối đa quick-retry
    const { reason } = candidate.normalizeError(lastError);
    return reason === 'quota_exceeded' || reason === 'auth' ? 1 : 2;
  }
}
```

**Vì sao đây là "tối ưu" cho mục tiêu độ trễ thấp nhất, không phải phỏng đoán**:

1. **Không network round-trip tới provider đã biết chết** — `circuit` map là in-memory, sống theo vòng đời process (NestJS singleton). Sau lần đầu 1 provider fast-fail (hết credit/sai key), mọi lượt chat *tiếp theo* trong `COOLDOWN_LONG_MS` (10 phút) bỏ qua nó hoàn toàn ở bước `pickHealthy()` — O(1) so sánh timestamp, không gọi HTTP. Đây là phần quan trọng nhất cho latency thực tế khi outage kéo dài (vd hết credit cả buổi) — không phải chỉ tối ưu 1 lượt gọi đơn lẻ.
2. **Quick-retry có trần thời gian cứng** (150ms cố định × tối đa 1 lần) thay vì exponential backoff (cũ: có thể lên tới hàng giây/chục giây) — bắt được lỗi thoáng qua mà không cộng dồn độ trễ lớn.
3. **Fast-fail bỏ qua quick-retry hoàn toàn** cho lỗi biết chắc không tự khỏi (quota/auth) — đúng yêu cầu "hết credit thì không cần retry, fallback sớm".
4. **Greedy theo đúng thứ tự ưu tiên** (không round-robin/random) — đúng ý "bóc cái đầu tiên còn ổn trong tập secondary", và dễ đoán/dễ debug hơn các thuật toán cân bằng tải phức tạp mà tính năng này không cần.

`COOLDOWN_LONG_MS` (10 phút), `COOLDOWN_SHORT_MS` (5 giây), `QUICK_RETRY_DELAY_MS` (150ms) đọc từ config, có default — theo đúng pattern các hằng số retry hiện có trong `LlmExecutionConfigService`.

**Model không portable**: mỗi provider có model id riêng (`gpt-5.4` không tồn tại trên OpenRouter/MiniMax). `runFailover` luôn override `request.model` bằng `candidate.getDefaultModel()` trước khi gọi — caller (agent loop, report service...) không cần biết model nào đang thực sự chạy, chỉ cần đọc `response.metadata.provider` + `response.metadata.model` sau khi có response (field này đã tồn tại sẵn, không cần đổi schema).

**`isRetryableError() = false`** là điểm mấu chốt để 3 lớp retry hiện có (`LlmAgentService.withRetry`, `LlmExecutionService.runWithRetry`, `DiscordAgentService.runWithRetry`) **dừng ngay lập tức** khi `FailoverLlmProviderAdapter` throw `LlmAllProvidersExhaustedError` — không lặp lại toàn bộ chuỗi failover+quick-retry vô ích ở tầng trên.

### 8. Mở rộng thêm provider mới sau này — không đổi logic core

Thêm 1 provider mới (Anthropic, Gemini, DeepSeek riêng, ...) chỉ cần:

1. Tạo class adapter mới implement (hoặc extend `OpenAiAdapter` nếu API tương thích OpenAI format) `LlmProviderAdapter`, quan trọng nhất là `normalizeError()` trả đúng `reason` theo 5 giá trị enum đã có (`rate_limit` / `server_error` / `auth` / `quota_exceeded` / `unknown`) dựa trên error shape riêng của provider đó.
2. Thêm 1 `case` mới trong `createLlmProviderAdapter()` (factory switch).
3. Thêm entry config mới (API key/model/baseURL getters) + thêm tên provider vào `LLM_PROVIDER_FAILOVER_ORDER` khi muốn bật.

**Không đổi** `FailoverLlmProviderAdapter` — toàn bộ logic circuit-breaker/quick-retry/fast-fail hoạt động thuần dựa trên interface `LlmProviderAdapter` + `reason` enum chung, không biết và không cần biết provider cụ thể là gì. Đây chính là lý do `normalizeError()` phải trả `reason` chuẩn hoá thay vì để logic failover tự parse error shape riêng của từng provider.

### 4. Factory

`packages/llm-agent/src/provider/factory.ts`:

```ts
export interface LlmProviderEntryConfig {
  provider: string; // 'openai' | 'openai-compatible' | 'openrouter' | 'minimax'
  getApiKey: () => string | undefined;
  getModel: () => string;
  getBaseUrl?: () => string | undefined;
}

export function createLlmProviderAdapter(config: LlmProviderEntryConfig): LlmProviderAdapter {
  switch (config.provider) {
    case 'openai': return new OpenAiAdapter(...);
    case 'openai-compatible': return new OpenAiCompatibleAdapter(...);
    case 'openrouter': return new OpenRouterAdapter(...);
    case 'minimax': return new MiniMaxAdapter(...);
    default: return new OpenAiAdapter(..., config.provider); // giữ nguyên fallback cũ
  }
}

/**
 * Xây failover chain theo thứ tự `order`. Provider không configured (thiếu API key)
 * bị loại khỏi danh sách candidate ngay tại đây — không đợi tới runtime mới biết.
 * Nếu chỉ có 0-1 provider configured → trả thẳng adapter đó (không bọc Failover),
 * giữ nguyên hành vi/độ trễ hiện tại cho case phổ biến nhất.
 */
export function createFailoverLlmProviderAdapter(
  entries: LlmProviderEntryConfig[],
  order: string[],
  logger?: { warn: (msg: string) => void },
): LlmProviderAdapter {
  const byProvider = new Map(entries.map((e) => [e.provider, e]));
  const orderedAdapters = order
    .map((name) => byProvider.get(name))
    .filter((e): e is LlmProviderEntryConfig => !!e)
    .map((e) => createLlmProviderAdapter(e))
    .filter((a) => a.isConfigured());

  if (orderedAdapters.length === 0) {
    throw new Error('No LLM provider configured in failover order');
  }
  if (orderedAdapters.length === 1) {
    return orderedAdapters[0];
  }
  return new FailoverLlmProviderAdapter(orderedAdapters, logger);
}
```

### 5. Config (env vars mới)

| Var | App | Ghi chú |
|-----|-----|---------|
| `LLM_PROVIDER_FAILOVER_ORDER` | cả 2 | CSV, vd `openai,openrouter,minimax`. Rỗng/absent → hành vi cũ (`LLM_PROVIDER` đơn, không failover). |
| `OPENROUTER_API_KEY` | cả 2 | |
| `OPENROUTER_MODEL` | cả 2 | default TBD — xem Open Questions |
| `OPENROUTER_BASE_URL` | cả 2 | default `https://openrouter.ai/api/v1` |
| `MINIMAX_API_KEY` | cả 2 | |
| `MINIMAX_MODEL` | cả 2 | default TBD |
| `MINIMAX_BASE_URL` | cả 2 | default TBD — verify endpoint OpenAI-compatible thật của MiniMax |
| `LLM_FAILOVER_COOLDOWN_LONG_MS` | cả 2 | default 600_000 (10 phút) — cooldown sau lỗi fast-fail (quota/auth) |
| `LLM_FAILOVER_COOLDOWN_SHORT_MS` | cả 2 | default 5_000 — cooldown sau lỗi transient (rate_limit/server_error/unknown) |
| `LLM_FAILOVER_QUICK_RETRY_DELAY_MS` | cả 2 | default 150 — delay cố định giữa 2 lần thử trên cùng 1 provider trước khi failover |

`LlmExecutionConfigService` (messenger-bot) thêm getters tương ứng theo pattern có sẵn (`getApiKey()`, `getModel()`, `getBaseUrl()` hiện tại) — không hardcode default number/token, theo `project-conventions.md`.

### 6. Wiring

- `apps/messenger-bot/.../llm-execution.module.ts`: đổi `useFactory` từ gọi `createLlmProviderAdapter(...)` đơn sang `createFailoverLlmProviderAdapter(entries, order, logger)`, `entries` build từ `LlmExecutionConfigService` (openai + openrouter + minimax).
- `apps/discord-bot/.../discord-chat.module.ts`: **bug fix** — bỏ `new OpenAiAdapter(...)` hardcode, dùng cùng `createFailoverLlmProviderAdapter` đọc trực tiếp từ `ConfigService` (discord-bot chưa có `LlmExecutionConfigService` riêng — có thể tái dùng luôn service này từ messenger-bot? **Không** — 2 app độc lập theo Turborepo boundary, discord-bot cần class con tương đương hoặc đọc `ConfigService` inline như hiện tại đang làm, chỉ mở rộng thành nhiều entries).

### 7. Đổi tên/log để dễ debug

Khi failover xảy ra, log `LLM_FAILOVER provider=<X> failed, trying next` (đã có trong pseudo-code trên) — cộng với `response.metadata.provider` sẵn có trong `LlmUsageRecorder`, đủ để biết provider nào thực sự trả lời mỗi lượt chat mà không cần thêm bảng/cột DB mới.

## Open Questions (cần verify trước khi code phần chi tiết lỗi)

1. **MiniMax base URL + error shape chính xác**: MiniMax có endpoint OpenAI-compatible (`ChatCompletion v2`) nhưng cần xác nhận base URL hiện hành (`api.minimax.io` hay `api.minimaxi.com`, khác nhau theo region/global vs China) và cấu trúc lỗi hết credit (`base_resp.status_code` hay HTTP status chuẩn) — nên tra cứu doc chính thức hoặc test thật với API key trước khi hardcode default.
2. **OpenRouter model id mặc định**: OpenRouter dùng format `vendor/model` (vd `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`) — cần chọn model default phù hợp ngân sách/latency cho use case chatbot học viên, không tự quyết định thay user.
3. Có cần retry-trong-cùng-1-provider **trước khi** failover cho lỗi rate_limit thoáng qua (429 tạm thời, không phải hết credit) không, hay luôn failover ngay lập tức như user yêu cầu? Spec này chọn **luôn failover ngay**, đơn giản hơn và đúng nguyên văn yêu cầu — nếu sau này thấy failover "quá nhạy" (đổi provider chỉ vì 1 lỗi mạng thoáng qua) thì có thể thêm 1 lần retry nhanh (không backoff) trước khi failover, nhưng đó là optimization để dành sau.

## Files Changed

| File | Change |
|------|--------|
| `packages/llm-agent/src/provider/types.ts` | Thêm `'quota_exceeded'` vào `LlmProviderError['reason']` |
| `packages/llm-agent/src/provider/openai/openai-adapter.ts` | `normalizeError()`/`isServerError()` nhận diện status 402 + marker text hết credit → `reason: 'quota_exceeded'` |
| `packages/llm-agent/src/provider/openrouter/openrouter-adapter.ts` | **Mới** — `OpenRouterAdapter extends OpenAiAdapter` |
| `packages/llm-agent/src/provider/minimax/minimax-adapter.ts` | **Mới** — `MiniMaxAdapter extends OpenAiAdapter` |
| `packages/llm-agent/src/provider/failover/failover-adapter.ts` | **Mới** — `FailoverLlmProviderAdapter` |
| `packages/llm-agent/src/provider/failover/failover.errors.ts` | **Mới** — `LlmAllProvidersExhaustedError` |
| `packages/llm-agent/src/provider/factory.ts` | Thêm case `openrouter`/`minimax`, thêm `createFailoverLlmProviderAdapter()` |
| `packages/llm-agent/src/index.ts` | Export adapter/factory/error mới |
| `apps/messenger-bot/src/modules/llm-execution/application/services/llm-execution-config.service.ts` | Thêm getters OpenRouter/MiniMax + `getFailoverOrder()` |
| `apps/messenger-bot/src/modules/llm-execution/llm-execution.module.ts` | Dùng `createFailoverLlmProviderAdapter` |
| `apps/discord-bot/src/modules/discord-chat/discord-chat.module.ts` | **Bug fix** — bỏ hardcode `OpenAiAdapter`, dùng `createFailoverLlmProviderAdapter` |
| `apps/messenger-bot/.env.example` (nếu có) | Thêm biến mới |
| `apps/discord-bot/.env.example` (nếu có) | Thêm biến mới |
| `docs/adr/0006-llm-provider-adapter.md` | Đánh dấu Phase 4 (Minimax adapter + multi-provider routing) → done, trỏ tới spec này |

Chi tiết breakdown thành từng task/commit nhỏ: xem [tasks.md](./tasks.md).

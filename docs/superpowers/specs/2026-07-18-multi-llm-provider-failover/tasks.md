# Tasks — Multi-LLM Provider Failover (OpenRouter + MiniMax)

Xem thiết kế đầy đủ ở [spec.md](./spec.md). Mỗi task = 1 commit nhỏ, có test đi kèm (theo `.claude/rules/project-conventions.md` — diff nhỏ, đúng tầng).

Trước khi bắt đầu: chốt 2 câu hỏi mở trong spec (MiniMax base URL/error shape, OpenRouter model default) — nếu chưa verify được doc chính thức, implement với giá trị placeholder rõ ràng + comment `// TODO verify` và note trong PR, không tự đoán bừa số liệu quan trọng (auth/billing).

## Phase 1 — `packages/llm-agent` provider layer

- [x] **1.1** Thêm `'quota_exceeded'` vào union `LlmProviderError['reason']` trong `provider/types.ts`.
- [x] **1.2** `OpenAiAdapter.normalizeError()` + private `isQuotaExhaustedError()`: nhận diện status `402`, hoặc status `429`/`400` kèm message/body chứa `insufficient_quota`/`insufficient credit`/`insufficient balance`/`billing` → trả `{ reason: 'quota_exceeded', retryable: false }`. Test: `openai-adapter.spec.ts` (tạo mới nếu chưa có, hoặc bổ sung file test hiện có) — case 402, case 429+insufficient_quota, case 429 rate-limit thường (không đổi hành vi cũ).
- [x] **1.3** `provider/openrouter/openrouter-adapter.ts` — `OpenRouterAdapter extends OpenAiAdapter`, default `providerName: 'openrouter'`, default baseUrl `https://openrouter.ai/api/v1`. Test: `openrouter-adapter.spec.ts` — `isConfigured()` false khi thiếu key, `providerName` đúng, default model/baseUrl đúng khi không truyền override.
- [x] **1.4** `provider/minimax/minimax-adapter.ts` — `MiniMaxAdapter extends OpenAiAdapter`, `providerName: 'minimax'`, default baseUrl (giá trị đã verify ở bước chuẩn bị). Test tương tự 1.3.
- [x] **1.5** `provider/failover/failover.errors.ts` — `LlmAllProvidersExhaustedError extends Error` (attempts: provider name[], cause: unknown), export từ `index.ts`.
- [x] **1.6** `provider/failover/failover-adapter.ts` — `FailoverLlmProviderAdapter` implement đầy đủ `LlmProviderAdapter` + circuit breaker + quick-retry policy (xem pseudo-code spec §3). Test `failover-adapter.spec.ts` (dùng `clock` injectable để test không phụ thuộc thời gian thật):
  - `generateJson`/`chatWithTools`: candidate 1 fail (reason bất kỳ) → candidate 2 thành công → trả kết quả candidate 2, không gọi candidate 3.
  - Tất cả candidate fail → throw `LlmAllProvidersExhaustedError` chứa đúng danh sách provider đã thử.
  - `isConfigured()` true khi ít nhất 1 candidate configured, false khi tất cả không (factory đã lọc trước, nhưng adapter tự vẫn phải an toàn nếu nhận mảng rỗng).
  - `isRetryableError()` luôn `false` (assert trực tiếp — hành vi mấu chốt để outer retry loop không lặp lại failover).
  - Model bị override đúng theo `candidate.getDefaultModel()` mỗi lần thử (mock 2 adapter có model khác nhau, assert request gửi tới mỗi adapter dùng đúng model của chính nó).
  - **FAST_FAIL (`quota_exceeded`/`auth`)**: candidate throw lỗi này → gọi candidate đúng **1 lần** (không quick-retry), failover ngay sang candidate tiếp theo, và candidate đó bị đặt cooldown dài (`healthyAgainAt` = now + `COOLDOWN_LONG_MS`).
  - **QUICK_RETRY (`rate_limit`/`server_error`/`unknown`)**: candidate throw lỗi này ở lần 1, thành công ở lần 2 → trả kết quả thành công, tổng cộng gọi candidate đó đúng 2 lần với delay giữa 2 lần = `QUICK_RETRY_DELAY_MS` (assert bằng fake timer, không phải đo thời gian thật). Nếu cả 2 lần đều fail → failover sang candidate tiếp theo, cooldown ngắn (`COOLDOWN_SHORT_MS`).
  - **Circuit breaker skip**: candidate đang trong cooldown (set `healthyAgainAt` tương lai qua injected `clock`) → `pickHealthy()` loại candidate đó khỏi danh sách thử, **không** gọi `call()` với nó (assert bằng spy không bị invoke) — chứng minh không tốn network round-trip cho provider đã biết chết.
  - Circuit breaker reset: candidate thành công ở lượt gọi sau → `circuit.delete()`, lượt tiếp theo candidate đó lại được thử bình thường (không bị kẹt cooldown vĩnh viễn dù cooldown chưa hết hạn tự nhiên).
  - Tất cả candidate đều đang cooldown cùng lúc → `pickHealthy()` fallback về full `candidates` (thử lại candidate đầu) thay vì throw ngay không thử gì — tránh outage giả nếu cooldown ước lượng sai.
  - `chatStream`: không failover giữa chừng — nếu candidate đầu tiên configured throw ngay khi bắt đầu iterate, **không** tự động chuyển sang candidate 2 (ghi rõ trong test đây là giới hạn đã biết, xem Non-goals) — nhưng vẫn tôn trọng circuit breaker khi *chọn* candidate ban đầu.
- [x] **1.7** `provider/factory.ts` — thêm `case 'openrouter'`, `case 'minimax'` vào `createLlmProviderAdapter()`; thêm `createFailoverLlmProviderAdapter(entries, order, logger?)`. Test `factory.spec.ts`:
  - `order` rỗng/1 provider configured → trả thẳng adapter đơn (không bọc `FailoverLlmProviderAdapter`) — assert bằng `instanceof`.
  - `order` ≥2 provider configured → trả `FailoverLlmProviderAdapter` với đúng thứ tự.
  - Provider trong `order` nhưng thiếu key (`isConfigured()===false`) → bị loại khỏi danh sách candidate.
  - `order` toàn provider không configured → throw lỗi rõ ràng.
- [x] **1.8** `packages/llm-agent/src/index.ts` — export `OpenRouterAdapter`, `MiniMaxAdapter`, `FailoverLlmProviderAdapter`, `LlmAllProvidersExhaustedError`, `createFailoverLlmProviderAdapter`, `LlmProviderEntryConfig`.
- [x] **1.9** Chạy `npx turbo run build test --filter=@wispace/llm-agent` — xanh trước khi sang Phase 2.

## Phase 2 — `apps/messenger-bot` wiring

- [x] **2.1** `llm-execution-config.service.ts` — thêm getters: `getFailoverOrder(): string[]` (parse CSV từ `LLM_PROVIDER_FAILOVER_ORDER`, rỗng nếu unset), `getOpenRouterApiKey/Model/BaseUrl()`, `getMiniMaxApiKey/Model/BaseUrl()`, `getFailoverCooldownLongMs/ShortMs()`, `getFailoverQuickRetryDelayMs()` — theo đúng pattern getter hiện có (default fallback, không throw). Test bổ sung vào spec hiện có của service (nếu chưa có file spec, tạo mới theo pattern các service khác trong module).
- [x] **2.2** `llm-execution.module.ts` — đổi `useFactory` sang build `entries: LlmProviderEntryConfig[]` (openai + openrouter + minimax, mỗi entry đọc từ config service) rồi gọi `createFailoverLlmProviderAdapter(entries, config.getFailoverOrder(), logger)`. Khi `getFailoverOrder()` rỗng → dùng đúng hành vi cũ (`[config.getProvider() ?? 'openai']`) để **không đổi behavior mặc định** cho deployment hiện tại chưa set biến mới.
- [x] **2.3** Cập nhật `.env.example` (nếu tồn tại trong `apps/messenger-bot`) với biến mới + comment ngắn.
- [x] **2.4** `npx turbo run build test --filter=@wispace/messenger-bot...` xanh.

## Phase 3 — `apps/discord-bot` wiring (kèm bug fix)

- [x] **3.1** `discord-chat.module.ts` — bỏ `new OpenAiAdapter(...)` hardcode trong `useFactory`. Xây `entries`/`order` tương tự Phase 2 nhưng đọc trực tiếp từ `ConfigService` (discord-bot chưa có config service riêng cho LLM — inline trong factory function, giữ đúng pattern hiện tại của file này, không tạo abstraction thừa cho 1 module).
- [x] **3.2** Regression test: xác nhận khi chỉ set `OPENAI_API_KEY` (không set `LLM_PROVIDER_FAILOVER_ORDER`), Discord bot vẫn dùng OpenAI đơn giống hệt trước khi sửa — test này quan trọng vì đây là bug fix, không được đổi hành vi mặc định của deployment hiện tại.
- [x] **3.3** Cập nhật `.env.example` discord-bot với biến mới.
- [x] **3.4** `npx turbo run build test --filter=@wispace/discord-bot...` xanh.

## Phase 4 — Docs

- [ ] **4.1** `docs/adr/0006-llm-provider-adapter.md` — đánh dấu Phase 4 (Minimax adapter + multi-provider routing) đã triển khai, thêm link tới spec này.
- [ ] **4.2** Nếu có doc liệt kê env vars đầy đủ (`apps/messenger-bot/docs/project-overview.md` hoặc tương tự) — thêm mục biến mới, theo checklist "Khi sửa code" trong `CLAUDE.md` (cập nhật tài liệu agent khi API/env đổi).

## Phase 5 — Verify toàn repo

- [ ] **5.1** `npx turbo run format`
- [ ] **5.2** `npx turbo run verify` (format:check + lint + typecheck + test + build, toàn workspace)
- [ ] **5.3** Test thủ công qua Discord/Messenger dev: set `LLM_PROVIDER_FAILOVER_ORDER=openai,openrouter` với `OPENAI_API_KEY` **cố tình sai** (giả lập hết credit — dùng key đã revoke hoặc rate-limit) + `OPENROUTER_API_KEY` hợp lệ → xác nhận bot vẫn trả lời được (qua OpenRouter) mà không phải đợi retry backoff lâu như log cũ (`LLM call failed after 4 attempts`).

## Lưu ý khi thực thi

- Theo `.claude/rules/clean-architecture.md`: sửa `packages/llm-agent` xong **phải** rebuild+test lại cả `apps/messenger-bot` và `apps/discord-bot` trước khi coi Phase 1 là "xong" thật sự (dependency giữa package và app).
- Không đổi tên/shape các field public hiện có (`LlmResponse.metadata.provider` đã đủ để track provider nào trả lời — không thêm cột DB mới).
- `FailoverLlmProviderAdapter.isRetryableError() = false` là quyết định thiết kế cốt lõi (spec §3) — đừng "sửa lại true cho nhất quán" khi thấy lạ mắt, nó cố tình tắt outer retry vì đã tự failover nội bộ rồi.

# Turborepo migration plan — Messenger + Discord + Zalo bots

Mục tiêu cuối: 3 bot (Messenger, Discord, Zalo) sống trong 1 Turborepo monorepo, deploy CI/CD **độc lập** từng bot, dùng chung 1 Postgres DB, và dùng chung phần **function-calling + gọi OpenAI API** qua `packages/llm-agent`. Quota/rate-limit tính **riêng theo từng bot** (không gộp chung theo học viên).

Tài liệu này mô tả các phase migrate — phase nào đã xong, phase nào còn lại.

---

## Phase 0 — Hiện trạng trước migration (đã xong, tham chiếu)

Repo NestJS đơn lẻ, `src/` ở root, 1 app duy nhất (Messenger bot), 1 Postgres DB (`ai_chat_bot_db`), khóa user = `psid` (Facebook PSID) trong toàn bộ entity liên quan chat/quota/mapping.

## Phase 1 — Turborepo scaffold + tách `packages/llm-agent` (ĐÃ XONG)

**Mục tiêu:** chuyển sang cấu trúc monorepo, tách phần orchestration LLM + function-calling schema + safety utils thành package framework-agnostic dùng chung, không đổi hành vi Messenger bot hiện tại.

**Đã làm:**
- `turbo.json` + root `package.json` (`workspaces: ["apps/*", "packages/*"]`).
- Di chuyển toàn bộ code hiện tại vào `apps/messenger-bot/` (package `@wispace/messenger-bot`) — giữ nguyên DB, entities, migrations, mọi module nghiệp vụ.
- Tạo `packages/llm-agent/` (`@wispace/llm-agent`) chứa:
  - `LlmAgentService` — vòng lặp tool-call OpenAI, generic theo `TToolContext`, không phụ thuộc NestJS.
  - `AGENT_TOOLS` / `AGENT_TOOL_NAMES` — schema function-calling (đổi tên từ `MESSENGER_AGENT_TOOLS`).
  - Ports (`ports.ts`): `LlmExecutionPort`, `LlmUsageRecorderPort`, `LlmSafetyEventPort`, `AgentMetricsPort`, `ToolExecutorPort<T>` — app implement các port này bằng service NestJS sẵn có.
  - Safety utils: `prompt-injection.utils.ts`, `llm-grounding.utils.ts`, `openai-error.utils.ts` (nguyên trạng từ `src/shared/utils/`).
  - `scope.utils.ts` (`isObviouslyOffTopic`), `messages.ts` (thông báo redirect/injection blocked), `text.utils.ts` (`sanitizeReplyText`) — logic domain WISPACE dùng chung, không đặc thù platform.
  - `utils/load-system-prompt.ts` — loader `.txt` generic (cache theo path); mỗi app vẫn giữ file prompt riêng (`apps/messenger-bot/src/shared/prompts/messenger-chat.system.txt` — nội dung có nhắc "Facebook Messenger" nên **không** tách, giữ ở app).
- `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` trở thành **adapter mỏng**: build system prompt (base + linkage), implement port bằng service Nest thật (`LlmExecutionService`, `LlmUsageRecorderService`, `LlmSafetyEventService`, `MetricsService`), gọi `LlmAgentService.reply()`, rồi ghép `richFollowUps` (tool handler vẫn tự accumulate qua `toolContext` — package không biết về khái niệm này).
- `messenger-agent-tools.service.ts` (tool handlers gọi Wispace API, business logic) **ở nguyên trong app**, implement `ToolExecutorPort`.
- Cập nhật `Dockerfile`, `.github/workflows/deploy.yml` (path filter + `turbo run ... --filter=@wispace/messenger-bot...`).
- Tạo placeholder rỗng `apps/discord-bot/`, `apps/zalo-bot/` (chỉ `package.json` + README trỏ tới phase 3/4 bên dưới).

**Rủi ro đã biết / chưa xử lý ở phase này:**
- `packages/llm-agent` build bằng `tsc` thô (không dùng NestJS CLI) — cần `npm install` ở root để workspace resolve trước khi build.
- Chưa test end-to-end thực tế (chỉ verify qua `turbo run build/lint/typecheck/test`) — xem mục Verification trong plan gốc.

---

## Phase 2 — Generalize khóa DB: `psid` → `(platform, external_user_id)` (ĐÃ XONG — đã chạy migration trên VPS production)

**Mục tiêu:** cho phép Discord/Zalo bot dùng chung DB mà không đụng độ khóa với Messenger.

**Đã làm:**
- Migration `1751029200001-GeneralizePlatformIdentifiers.ts` — với 11 bảng: thêm cột `platform varchar(16) DEFAULT 'messenger'`, đổi cột `psid` → `external_user_id`, đổi mọi unique/partial index liên quan để bao gồm `platform`. Đổi tên 7 bảng bỏ prefix `messenger_` (vì giờ dùng chung nhiều platform): `user_messenger_mappings→user_platform_mappings`, `messenger_chat_daily_usage→chat_daily_usage`, `messenger_chat_idempotency→chat_idempotency`, `messenger_message_logs→message_logs`, `messenger_scheduled_report_claims→scheduled_report_claims`, `messenger_webhook_dead_letters→webhook_dead_letters`, `messenger_chat_events→chat_quota_events`. Giữ nguyên tên `study_reminder_jobs`, `report_send_jobs`, `llm_usage_events`, `llm_safety_events`, `users` (đã đủ generic).
- **Không đổi public port method signature** (`MessengerRepositoryPort.findActiveMappingByPsid(psid)` vẫn giữ nguyên) — vì `apps/messenger-bot` là implementation duy nhất hiện có và luôn ghi `platform='messenger'`. Discord/Zalo (Phase 3/4) sẽ có repository implementation riêng của chính họ, không import từ `apps/messenger-bot`. Chỉ 7 file entity + 10 file repository implementation (persistence layer) bị đổi — application services/controllers/domain types hoàn toàn không đổi.
- **Quota/rate-limit vẫn tính riêng theo từng bot** (đã chốt trước đó) — chỉ cần thêm `platform` vào index/query key, không cần bảng map xuyên platform.

**Migration đã chạy trên VPS production** (qua `DB_MIGRATIONS_RUN=true` khi container khởi động, trigger tự động bởi deploy.yml) — xác nhận qua SSH: `\dt` trên `ai_chat_bot_db` cho đúng 13 bảng với tên mới (`user_platform_mappings`, `chat_daily_usage`, `chat_idempotency`, `message_logs`, `scheduled_report_claims`, `webhook_dead_letters`, `chat_quota_events` + 5 bảng giữ tên cũ có thêm cột `platform`/`external_user_id`), data cũ backfill `platform='messenger'` đúng, container `messenger-bot` boot sạch (`Nest application successfully started`, không lỗi).

**Sự cố đã gặp và fix trong lúc chạy (tham khảo khi làm Phase 3/4 nếu cần sửa migration khác):**
- `uq_chat_daily_usage_psid_date` là `CONSTRAINT` inline (tạo trong `CREATE TABLE` gốc), không phải `CREATE UNIQUE INDEX` như các unique key khác — `DROP INDEX` báo lỗi `cannot drop index ... because constraint ... requires it`. Phải dùng `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`. Migration transaction của TypeORM tự rollback sạch khi lỗi, DB không bị hư giữa chừng.
- Bug có sẵn trong `.github/scripts/vps-deploy.sh` (`set_env_var`) — `sed -i "s/^${key}=.*/${key}=${value}/"` dùng `/` làm delimiter nhưng giá trị (`DEPLOY_DIR=/deploy`...) cũng chứa `/`, phá cú pháp sed. Đổi delimiter sang `#`.

**Verify đã làm:** `npx turbo run format:check lint typecheck test build --filter=@wispace/messenger-bot...` pass toàn bộ (321 test, không đổi hành vi runtime nào — chỉ đổi tầng persistence) + verify thật trên VPS qua SSH.

---

## Phase 3 — Triển khai `apps/discord-bot` (CHƯA LÀM)

**Mục tiêu:** Discord bot thật, dùng chung `packages/llm-agent` + DB (đã generalize khóa ở Phase 2).

**Stack:** [Necord](https://necord.org/) — wrapper NestJS quanh `discord.js`, cung cấp decorator (`@Once`, `@On`, `@SlashCommand`, `@Context()`...) và tích hợp module/DI theo đúng phong cách NestJS đã dùng xuyên suốt repo (thay vì tự viết gateway thô bằng `discord.js` trần). `NecordModule.forRoot({ token, intents })` đăng ký client Discord như 1 NestJS module bình thường.

**Việc cần làm:**
- Cài `necord` + `discord.js` vào `apps/discord-bot`; `NecordModule.forRoot()` trong `AppModule` (token từ `.env`, intents tối thiểu: `Guilds`, `GuildMessages`, `MessageContent`, `DirectMessages` tùy cách bot nhận tin — ưu tiên slash command (`@SlashCommand`) hoặc DM listener (`@On('messageCreate')`) làm entrypoint chat).
- Implement `MessageSenderPort`-tương-đương cho Discord (gửi tin nhắn qua Discord REST API — Necord expose `Client` từ `discord.js` để `channel.send()`/`interaction.reply()`), tương tự `MessengerOutboundService`.
- Viết tool handlers riêng cho Discord (implement `ToolExecutorPort` từ `@wispace/llm-agent`) — gọi cùng Wispace API như Messenger, nhưng có thể tái dùng phần lớn logic nếu tách thêm 1 package `wispace-client` (không bắt buộc ở phase này, có thể copy tạm rồi tối ưu sau).
- Prompt riêng cho Discord (`apps/discord-bot/src/prompts/discord-chat.system.txt`) — không dùng chung file `.txt` với Messenger vì nội dung có thể cần đổi giọng văn / định dạng phù hợp Discord.
- Quota/rate-limit: dùng lại `chat-rate-limit` module pattern nhưng khóa theo `(platform='discord', external_user_id=discordUserId)`.

**Verify:** chat thử qua Discord server test (dùng Necord's `@On('clientReady')` để log bot online), xác nhận function-calling hoạt động đúng (gọi đúng tool, trả đúng dữ liệu Wispace).

---

## Phase 4 — Triển khai `apps/zalo-bot` (CHƯA LÀM)

Tương tự Phase 3, dùng Zalo OA API thay Discord REST API. Ưu tiên làm sau khi Phase 3 đã ổn định (rút kinh nghiệm cách adapter 1 bot mới vào `@wispace/llm-agent`).

---

## Phase 5 — Tách CI/CD hoàn toàn độc lập từng bot (CHƯA LÀM)

**Mục tiêu:** mỗi bot có pipeline build/test/deploy riêng, không phụ thuộc lẫn nhau.

**Việc cần làm:**
- 3 workflow riêng: `deploy-messenger-bot.yml`, `deploy-discord-bot.yml`, `deploy-zalo-bot.yml` — mỗi cái path-filter theo `apps/<bot>/**` + `packages/llm-agent/**` (đổi `packages/llm-agent` phải trigger rebuild+redeploy cả 3 bot, hoặc dùng Turborepo remote caching để chỉ rebuild bot nào thực sự cần).
- **Quy ước migration DB:** chỉ 1 pipeline (Messenger bot, vì đang chạy production lâu nhất) được phép chạy `migration:run`; các bot khác chỉ đọc schema, không tự chạy migration — tránh race condition khi 3 CI chạy song song trên cùng 1 DB.
- Secrets/env riêng theo từng bot qua Doppler (Discord bot token, Zalo OA token...).
- Docker image + deploy target riêng cho mỗi bot trên VPS (hoặc tách host nếu cần scale riêng).

**Verify:** trigger deploy độc lập từng bot (chỉ sửa 1 app, xác nhận chỉ pipeline tương ứng chạy — trừ khi sửa `packages/llm-agent` thì cả 3 đều rebuild).

---

## Tổng kết theo trạng thái

| Phase | Nội dung | Trạng thái |
|-------|----------|-----------|
| 0 | Hiện trạng ban đầu | Tham chiếu |
| 1 | Turborepo scaffold + tách `packages/llm-agent` + placeholder discord/zalo | ✅ Đã xong |
| 2 | Generalize khóa DB `(platform, external_user_id)` | ✅ Đã xong — đã chạy migration trên VPS production, verify qua SSH |
| 3 | Triển khai Discord bot | ⏳ Chưa làm |
| 4 | Triển khai Zalo bot | ⏳ Chưa làm |
| 5 | CI/CD độc lập hoàn toàn | ⏳ Chưa làm |

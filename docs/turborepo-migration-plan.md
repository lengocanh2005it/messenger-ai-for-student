# Turborepo migration plan — Messenger + Discord + Zalo bots

Mục tiêu cuối: 3 bot (Messenger, Discord, Zalo) sống trong 1 Turborepo monorepo, deploy CI/CD **độc lập** từng bot, dùng chung 1 Postgres DB, và dùng chung phần **function-calling + gọi OpenAI API** qua `packages/llm-agent`, **quota/rate-limit + LLM usage/safety tracking** qua `packages/chat-metering`, cũng như **Wispace API HTTP client** (goals/scores/calendar) qua `packages/wispace-client`. Quota/rate-limit tính **riêng theo từng bot** (không gộp chung theo học viên) — engine dùng chung, số đếm tách theo `platform`.

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

## Phase 3 — Triển khai `apps/discord-bot` (chat + quota/usage/safety + account-linking + 6/7 tool handlers ĐÃ XONG; register_exam_report_notifications CHƯA LÀM)

**Mục tiêu:** Discord bot thật, dùng chung `packages/llm-agent` + `packages/chat-metering` + DB (đã generalize khóa ở Phase 2).

**Stack:** [Necord](https://necord.org/) — wrapper NestJS quanh `discord.js`, cung cấp decorator (`@Once`, `@On`, `@Context()`...) và tích hợp module/DI theo đúng phong cách NestJS đã dùng xuyên suốt repo (thay vì tự viết gateway thô bằng `discord.js` trần). `NecordModule.forRootAsync()` đăng ký client Discord như 1 NestJS module bình thường (`@Global`, expose `Client` từ `discord.js` làm injection token).

**Đã làm (MVP):**
- `apps/discord-bot` scaffold NestJS đầy đủ (package.json, nest-cli.json, tsconfig, eslint dùng chung root config) — `NestFactory.createApplicationContext` (không cần HTTP server, bot chỉ giữ kết nối gateway).
- `NecordModule.forRootAsync()` trong `AppModule`, token từ `DISCORD_BOT_TOKEN` (.env), intents `Guilds` + `DirectMessages` + `MessageContent`, `partials: [Channel]` (bắt buộc để nhận DM trước khi channel được cache).
- `DiscordChatGateway` (`modules/discord-chat/presentation/gateways/`) — `@Once('ready')` log bot online, `@On('messageCreate')` làm entrypoint chat (chỉ xử lý DM, bỏ qua bot/không phải DM).
- `DiscordOutboundService` — tương đương `MessageSenderPort`, gửi DM qua `client.users.fetch(id).send(text)` (tách khỏi gateway để tái dùng cho proactive send sau này).
- `DiscordAgentService` (`application/agent/`) — adapter mỏng quanh `LlmAgentService` từ `@wispace/llm-agent`, giống `MessengerAgentService`: retry OpenAI lỗi tạm thời (`isOpenAiRetryableError`), usage/safety events persist qua `@wispace/chat-metering` (platform='discord').
- `DiscordAgentToolsService` — **stub**: trả `{ available: false, message: '...' }` cho mọi tool trong `AGENT_TOOLS` (chưa có account-linking Discord ↔ WISPACE userId nên chưa gọi Wispace API thật).
- `DiscordChatHistoryService` — lịch sử hội thoại **in-memory only** (Map trong process, mất khi restart, không multi-pod) — khác `CHAT_HISTORY_STORE` của Messenger (có Redis mode).
- Prompt riêng `apps/discord-bot/src/shared/prompts/discord-chat.system.txt` (không dùng chung file với Messenger).
- **`packages/chat-metering`** (package framework-agnostic mới, thứ 2 sau `llm-agent`) — tách core quota/rate-limit (`ChatRateLimitCore`, atomic reserve/refund/daily-limit qua `chat_daily_usage`/`chat_idempotency`) + LLM usage/safety event recorder (`LlmUsageRecorderCore`, `LlmSafetyCore`) dùng chung Messenger + Discord, `platform` truyền qua constructor. `apps/messenger-bot`'s repository cũ (`ChatRateLimitRepository`, `LlmUsageRepository`, `LlmSafetyEventRepository`) refactor thành thin wrapper quanh package — **không đổi hành vi** (321 → 308 test do phần SQL chuyển sang 18 test riêng của package, cộng lại vẫn cover đủ). Chi tiết ranh giới: `.claude/rules/clean-architecture.md`.
- `apps/discord-bot`'s `DiscordChatRateLimitService`/`DiscordLlmUsageRecorderService`/`DiscordLlmSafetyEventService` (`modules/chat-metering/`) — dùng `MemoryBurstCounter` + `DirectUsageWriter` (không BullMQ, không quota-event audit table, không whitelist — khác Messenger, xem rule). `DiscordChatGateway` reserve trước khi gọi agent, refund khi lỗi, complete khi gửi xong; deny thì gửi tin nhắn quota/burst tiếng Việt.
- **Account-linking Discord ↔ WISPACE userId qua OAuth2 + WISPACE verify-token API dùng chung 3 bot** (`modules/account-link/`) — Discord không có deep-link kèm payload như `m.me/<page>?ref=` của Messenger, nên dùng OAuth2 `identify` scope để lấy Discord user id, kết hợp **`WISPACE_API_VERIFY_TOKEN_URL`** (cùng 1 URL cho cả Messenger/Discord/Zalo, body `{token, value, platform}`) để resolve `userId` — không cần tự ký/verify token, không cần thêm endpoint mới bên WISPACE. WISPACE hiển thị link "Connect Discord" trỏ tới Discord's authorize URL kèm `state` = token WISPACE tự sinh (nguyên trạng, WISPACE tự quản lý hạn dùng/one-time). `apps/discord-bot` giờ chạy như HTTP app (`NestFactory.create` thay vì `createApplicationContext`) để expose `GET /discord/oauth/callback`: đổi `code` lấy Discord user id (`/oauth2/token` + `/users/@me`) → gọi `WISPACE_API_VERIFY_TOKEN_URL` (header `X-Internal-Key`, body `{token, value: discordUserId, platform: 'discord'}`) lấy `userId` → upsert `discord_account_links` (bảng mới, migration trong `apps/messenger-bot`, chỉ discord-bot đọc/ghi) → gửi DM chào mừng. `DiscordChatGateway` resolve `userId` qua `DiscordAccountLinkService.findUserIdByDiscordId` mỗi tin nhắn, truyền vào `DiscordAgentToolContext`. Chi tiết contract phía WISPACE backend: [apps/discord-bot/docs/discord-account-linking.md](../apps/discord-bot/docs/discord-account-linking.md) (WISPACE chỉ cần hiển thị link kèm token đã có, và endpoint verify-token đã tồn tại).
- **`packages/wispace-client`** (package framework-agnostic mới, thứ 3 sau `llm-agent`/`chat-metering`) — tách HTTP client Wispace (`UserGoalsApiClient`, `TaskScoreAverageApiClient`, `UserCalendarApiClient`, `UserCalendarScheduleClient`) + retry/error (`withRetry`, `WispaceApiError`) + toàn bộ `study-calendar.utils.ts` (date/timezone math) dùng chung Messenger + Discord. Header xác định học viên giờ tổng quát hoá thành `buildWispaceHeaders(idHeader, externalId, internalKey)` với `idHeader` ∈ `x-psid` \| `x-discordid` \| `x-zaloid` (WISPACE API đã hỗ trợ cả 3 — chỉ gửi header ứng với platform, không cần đổi gì bên WISPACE). `apps/messenger-bot`'s `UserGoalsApiService`/`TaskScoreAverageApiService`/`UserCalendarApiService`/`UserCalendarScheduleService` refactor thành thin wrapper (platform=`x-psid`) — hành vi không đổi, verify lại toàn bộ 304 test messenger-bot pass.
- **6/7 tool WISPACE thật cho Discord** (`modules/wispace/` — `WispaceGoalsService`, `WispaceCalendarService`, `DiscordStudyCalendarCommandService`) — `get_user_goals`, `get_learning_progress_report` (trả raw goals+scores, LLM chat chính tự narrate — không port riêng `StudentReportService`'s LLM call), `get_upcoming_study_sessions`, `list_study_calendar_entries`, `preview_next_study_reminder` giờ gọi Wispace API thật (`x-discordid`) khi `ctx.userId` đã resolve; chưa link thì trả thông báo "chưa liên kết" tiếng Việt.
- **`reschedule_study_session` (ĐÃ XONG)** — Discord counterpart của Messenger postback confirm/cancel: `DiscordAgentToolsService` stage pending qua `DiscordRescheduleConfirmationService` (Map theo `discordUserId` + TTL 10 phút, giống Messenger's `MessengerRescheduleConfirmationService`), gửi DM tóm tắt kèm 2 nút Discord button (`ActionRowBuilder`/`ButtonBuilder`, style Success/Danger) qua `DiscordOutboundService.sendRescheduleConfirmation`. Bấm nút xử lý bằng Necord `@Button(customId)` decorator trong `DiscordChatGateway` (`onRescheduleConfirm`/`onRescheduleCancel`), route theo `interaction.user.id` — đơn giản hơn Messenger vì không cần encode payload vào customId. Ghi lịch thật qua `DiscordStudyCalendarCommandService.rescheduleSession` (delete + create calendar, tái dùng `resolveRescheduleSlot`/`resolveScheduledAtFromEventDate` từ `@wispace/wispace-client` + `formatScheduledTimeLabel`/`getMinutesUntilSession` từ `@wispace/study-reminder-core`) — không có outbox sync sau khi đổi lịch (Discord chưa có hệ thống job nhắc lịch riêng).
- **Còn stub: `register_exam_report_notifications` (quyết định: giữ nguyên, không code)** — tool này tồn tại ở Messenger để lách giới hạn 24h nhắn tin của Meta (phải opt-in "Notification Messages" mới nhắn được ngoài 24h kể từ tin cuối của user); Discord **không có** giới hạn 24h này nên bot có thể DM bất cứ lúc nào, không cần "đăng ký" gì. Quan trọng hơn: Discord chưa port `ReportCronService` (cron gửi báo cáo AI định kỳ trước ngày thi) — dù có implement "đăng ký" bây giờ (mặc định cadence=WEEKLY, khớp fallback default của Messenger ở `poc.constants.ts`) thì cũng chưa có gì đọc lại để gửi báo cáo, thành tính năng nửa vời. Chỉ làm khi port cả cron báo cáo định kỳ sang Discord.
- Unit test cho `DiscordChatHistoryService`, `DiscordAgentToolsService` (bao gồm case đã/chưa liên kết cho tất cả tool + case reschedule hợp lệ/lỗi), `DiscordOutboundService` (bao gồm gửi confirm DM có button), `WispaceDiscordTokenVerifyService`, `DiscordAccountLinkService`, `DiscordOauthController`, và `packages/wispace-client` (`UserGoalsApiClient`, `user-calendar-record.normalizer`, `buildWispaceHeaders`).

**Còn thiếu (chưa làm):**
- `register_exam_report_notifications` — quyết định: giữ stub, chỉ làm khi port `ReportCronService` (cron báo cáo định kỳ) sang Discord (xem trên).
- WISPACE web/app team hiển thị link "Connect Discord" (chỉ cần build URL với token account-link có sẵn) — chưa test thật end-to-end (cần Discord Application OAuth2 client thật + redirect URI public HTTPS + xác nhận response shape thật của `WISPACE_API_VERIFY_TOKEN_URL` khớp `WispaceDiscordTokenVerifyService`).
- Chat history bền vững / multi-pod (Redis) nếu cần scale nhiều instance.
- Whitelist, quota-event audit table, stuck-reserved recovery, ops CLI cho Discord (Messenger-only hiện tại).
- `apps/messenger-bot`'s local `study-reminder/application/utils/study-calendar.utils.ts` giờ trùng với `packages/wispace-client`'s bản port (`resolveRescheduleSlot` vẫn dùng cho reschedule Messenger) — chưa dedupe, để tránh mở rộng phạm vi refactor lần này.

**Verify đã làm:** `npx turbo run format:check lint typecheck test build --filter=@wispace/messenger-bot... --filter=@wispace/discord-bot... --filter=@wispace/chat-metering... --filter=@wispace/wispace-client...` pass toàn bộ (messenger-bot 304 test + chat-metering 18 test + wispace-client 10 test + discord-bot 26 test). Chưa test thật với Discord server (cần `DISCORD_BOT_TOKEN` thật + bật `MESSAGE CONTENT INTENT` trong Developer Portal), chưa test thật kết nối DB (`DB_*` env) hoặc Wispace API thật (`WISPACE_API_*_URL` + `x-discordid`) cho Discord, và chưa test thật luồng OAuth (cần redirect URI public + WISPACE backend hiển thị link "Connect Discord").

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
| 3 | Triển khai Discord bot | 🟡 Chat + quota/usage/safety (dùng `packages/chat-metering` chung Messenger) xong — tool handlers thật (Wispace API + account-linking) chưa làm |
| 4 | Triển khai Zalo bot | ⏳ Chưa làm |
| 5 | CI/CD độc lập hoàn toàn | ⏳ Chưa làm |

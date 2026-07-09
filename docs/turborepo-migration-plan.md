# Turborepo migration plan — Messenger + Discord + Zalo bots

End goal: 3 bots (Messenger, Discord, Zalo) living in 1 Turborepo monorepo, with **independent** CI/CD deploy per bot, sharing 1 Postgres DB, and sharing the **function-calling + OpenAI API calls** layer via `packages/llm-agent`, **quota/rate-limit + LLM usage/safety tracking** via `packages/chat-metering`, as well as **Wispace API HTTP client** (goals/scores/calendar) via `packages/wispace-client`. Quota/rate-limit is calculated **independently per bot** (not aggregated per student) — the engine is shared, counters are split by `platform`.

This document describes the migration phases — which phases are complete and which remain.

---

## Phase 0 — Pre-migration baseline (completed, reference)

Single NestJS repo, `src/` at root, one app only (Messenger bot), one Postgres DB (`ai_chat_bot_db`), user key = `psid` (Facebook PSID) across all chat/quota/mapping entities.

## Phase 1 — Turborepo scaffold + extract `packages/llm-agent` (DONE)

**Goal:** move to monorepo structure, extract the LLM orchestration + function-calling schema + safety utils into a framework-agnostic shared package, without changing the current Messenger bot behavior.

**Completed:**
- `turbo.json` + root `package.json` (`workspaces: ["apps/*", "packages/*"]`).
- Moved all existing code into `apps/messenger-bot/` (package `@wispace/messenger-bot`) — kept DB, entities, migrations, and all business modules intact.
- Created `packages/llm-agent/` (`@wispace/llm-agent`) containing:
  - `LlmAgentService` — OpenAI tool-call loop, generic over `TToolContext`, no NestJS dependency.
  - `AGENT_TOOLS` / `AGENT_TOOL_NAMES` — function-calling schema (renamed from `MESSENGER_AGENT_TOOLS`).
  - Ports (`ports.ts`): `LlmExecutionPort`, `LlmUsageRecorderPort`, `LlmSafetyEventPort`, `AgentMetricsPort`, `ToolExecutorPort<T>` — apps implement these ports using existing NestJS services.
  - Safety utils: `prompt-injection.utils.ts`, `llm-grounding.utils.ts`, `openai-error.utils.ts` (unchanged from `src/shared/utils/`).
  - `scope.utils.ts` (`isObviouslyOffTopic`), `messages.ts` (redirect/injection blocked notifications), `text.utils.ts` (`sanitizeReplyText`) — shared WISPACE domain logic, not platform-specific.
  - `utils/load-system-prompt.ts` — generic `.txt` loader (path-based caching); each app keeps its own prompt file (`apps/messenger-bot/src/shared/prompts/messenger-chat.system.txt` — contains "Facebook Messenger" references so it **cannot** be split out, stays in the app).
- `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` became a **thin adapter**: builds system prompt (base + linkage), implements ports with real NestJS services (`LlmExecutionService`, `LlmUsageRecorderService`, `LlmSafetyEventService`, `MetricsService`), calls `LlmAgentService.reply()`, then appends `richFollowUps` (tool handlers still accumulate via `toolContext` — the package is unaware of this concept).
- `messenger-agent-tools.service.ts` (tool handlers calling Wispace API, business logic) **stays in the app**, implementing `ToolExecutorPort`.
- Updated `Dockerfile`, `.github/workflows/deploy.yml` (path filter + `turbo run ... --filter=@wispace/messenger-bot...`).
- Created empty placeholders `apps/discord-bot/`, `apps/zalo-bot/` (only `package.json` + README pointing to Phase 3/4 below).

**Known risks / not yet addressed in this phase:**
- `packages/llm-agent` is built with plain `tsc` (not NestJS CLI) — requires `npm install` at root so workspace resolves before building.
- No real end-to-end testing done (only verified via `turbo run build/lint/typecheck/test`) — see the Verification section in the original plan.

---

## Phase 2 — Generalize DB keys: `psid` → `(platform, external_user_id)` (DONE — migration run on production VPS)

**Goal:** allow Discord/Zalo bots to share the DB without key collisions with Messenger.

**Completed:**
- Migration `1751029200001-GeneralizePlatformIdentifiers.ts` — touching 11 tables: added column `platform varchar(16) DEFAULT 'messenger'`, renamed column `psid` → `external_user_id`, updated all related unique/partial indexes to include `platform`. Renamed 7 tables to drop the `messenger_` prefix (now shared across platforms): `user_messenger_mappings→user_platform_mappings`, `messenger_chat_daily_usage→chat_daily_usage`, `messenger_chat_idempotency→chat_idempotency`, `messenger_message_logs→message_logs`, `messenger_scheduled_report_claims→scheduled_report_claims`, `messenger_webhook_dead_letters→webhook_dead_letters`, `messenger_chat_events→chat_quota_events`. Kept names for `study_reminder_jobs`, `report_send_jobs`, `llm_usage_events`, `llm_safety_events`, `users` (already generic enough).
- **No public port method signature changes** (`MessengerRepositoryPort.findActiveMappingByPsid(psid)` unchanged) — because `apps/messenger-bot` is the only implementation currently and always writes `platform='messenger'`. Discord/Zalo (Phase 3/4) will have their own repository implementations, not importing from `apps/messenger-bot`. Only 7 entity files + 10 repository implementation files (persistence layer) changed — application services/controllers/domain types completely unchanged.
- **Quota/rate-limit still calculated independently per bot** (decided previously) — only need to add `platform` to index/query keys, no cross-platform mapping table needed.

**Migration ran on production VPS** (via `DB_MIGRATIONS_RUN=true` on container startup, auto-triggered by deploy.yml) — verified via SSH: `\dt` on `ai_chat_bot_db` shows exactly 13 tables with the new names (`user_platform_mappings`, `chat_daily_usage`, `chat_idempotency`, `message_logs`, `scheduled_report_claims`, `webhook_dead_letters`, `chat_quota_events` + 5 tables keeping old names with added `platform`/`external_user_id` columns), old data backfilled with `platform='messenger'` correctly, `messenger-bot` container booted clean (`Nest application successfully started`, no errors).

**Incidents encountered and fixed during the run (reference for Phase 3/4 if other migrations need changes):**
- `uq_chat_daily_usage_psid_date` was an inline `CONSTRAINT` (created in the original `CREATE TABLE`), not a `CREATE UNIQUE INDEX` like other unique keys — `DROP INDEX` failed with `cannot drop index ... because constraint ... requires it`. Had to use `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`. TypeORM migration transactions roll back cleanly on error, DB was not corrupted.
- Pre-existing bug in `.github/scripts/vps-deploy.sh` (`set_env_var`) — `sed -i "s/^${key}=.*/${key}=${value}/"` used `/` as delimiter but values (`DEPLOY_DIR=/deploy`...) also contain `/`, breaking sed syntax. Changed delimiter to `#`.

**Verification done:** `npx turbo run format:check lint typecheck test build --filter=@wispace/messenger-bot...` all passed (321 tests, no runtime behavior changes — only persistence layer changed) + verified on production VPS via SSH.

---

## Phase 3 — Deploy `apps/discord-bot` (chat + quota/usage/safety + account-linking + 6/7 real tool handlers DONE; register_exam_report_notifications NOT DONE)

**Goal:** Real Discord bot, sharing `packages/llm-agent` + `packages/chat-metering` + DB (keys generalized in Phase 2).

**Stack:** [Necord](https://necord.org/) — NestJS wrapper around `discord.js`, providing decorators (`@Once`, `@On`, `@Context()`...) and module/DI integration following the same NestJS style used throughout the repo (instead of manually writing a raw `discord.js` gateway). `NecordModule.forRootAsync()` registers the Discord client as a regular NestJS module (`@Global`, exposes `Client` from `discord.js` as an injection token).

**Completed (MVP):**
- Full NestJS scaffold for `apps/discord-bot` (package.json, nest-cli.json, tsconfig, eslint using shared root config) — `NestFactory.createApplicationContext` (no HTTP server needed, bot only maintains the gateway connection).
- `NecordModule.forRootAsync()` in `AppModule`, token from `DISCORD_BOT_TOKEN` (.env), intents `Guilds` + `DirectMessages` + `MessageContent`, `partials: [Channel]` (required to receive DMs before channel is cached).
- `DiscordChatGateway` (`modules/discord-chat/presentation/gateways/`) — `@Once('ready')` logs bot online, `@On('messageCreate')` serves as chat entrypoint (only processes DMs, ignores bot/non-DM messages).
- `DiscordOutboundService` — equivalent to `MessageSenderPort`, sends DMs via `client.users.fetch(id).send(text)` (separated from the gateway for reuse in proactive sends later).
- `DiscordAgentService` (`application/agent/`) — thin adapter around `LlmAgentService` from `@wispace/llm-agent`, same as `MessengerAgentService`: retries transient OpenAI errors (`isOpenAiRetryableError`), persists usage/safety events via `@wispace/chat-metering` (platform='discord').
- `DiscordAgentToolsService` — **stub**: returns `{ available: false, message: '...' }` for every tool in `AGENT_TOOLS` (no Discord ↔ WISPACE userId account-linking yet, so no real Wispace API calls).
- `DiscordChatHistoryService` — **in-memory only** conversation history (Map in process, lost on restart, no multi-pod) — different from Messenger's `CHAT_HISTORY_STORE` (which has Redis mode).
- Custom prompt `apps/discord-bot/src/shared/prompts/discord-chat.system.txt` (not shared with Messenger).
- **`packages/chat-metering`** (new framework-agnostic package, second after `llm-agent`) — extracted core quota/rate-limit (`ChatRateLimitCore`, atomic reserve/refund/daily-limit via `chat_daily_usage`/`chat_idempotency`) + LLM usage/safety event recorder (`LlmUsageRecorderCore`, `LlmSafetyCore`) shared by Messenger + Discord, `platform` passed via constructor. `apps/messenger-bot`'s existing repositories (`ChatRateLimitRepository`, `LlmUsageRepository`, `LlmSafetyEventRepository`) refactored into thin wrappers around the package — **no behavior change** (321 → 308 tests as some SQL moved to 18 package-specific tests, total coverage still complete). Boundary details: `.claude/rules/clean-architecture.md`.
- `apps/discord-bot`'s `DiscordChatRateLimitService`/`DiscordLlmUsageRecorderService`/`DiscordLlmSafetyEventService` (`modules/chat-metering/`) — use `MemoryBurstCounter` + `DirectUsageWriter` (no BullMQ, no quota-event audit table, no whitelist — different from Messenger, see rules). `DiscordChatGateway` reserves before calling the agent, refunds on error, completes after sending; denied requests send Vietnamese quota/burst messages.
- **Account-linking Discord ↔ WISPACE userId via OAuth2 + shared WISPACE verify-token API used by all 3 bots** (`modules/account-link/`) — Discord has no deep-link with payload like Messenger's `m.me/<page>?ref=`, so it uses OAuth2 `identify` scope to get the Discord user id, combined with **`WISPACE_API_VERIFY_TOKEN_URL`** (same URL for Messenger/Discord/Zalo, body `{token, value, platform}`) to resolve `userId` — no custom token signing/verification needed, no new WISPACE backend endpoint required. WISPACE displays a "Connect Discord" link pointing to Discord's authorize URL with `state` = a WISPACE-generated link token (unchanged, WISPACE manages expiry/one-time use). `apps/discord-bot` now runs as an HTTP app (`NestFactory.create` instead of `createApplicationContext`) to expose `GET /discord/oauth/callback`: exchanges `code` for Discord user id (`/oauth2/token` + `/users/@me`) → calls `WISPACE_API_VERIFY_TOKEN_URL` (header `X-Internal-Key`, body `{token, value: discordUserId, platform: 'discord'}`) to get `userId` → upserts `discord_account_links` (new table, migration in `apps/messenger-bot`, only discord-bot reads/writes) → sends welcome DM. `DiscordChatGateway` resolves `userId` via `DiscordAccountLinkService.findUserIdByDiscordId` on every message, passing it into `DiscordAgentToolContext`. WISPACE backend contract details: [apps/discord-bot/docs/discord-account-linking.md](../apps/discord-bot/docs/discord-account-linking.md) (WISPACE only needs to display the link with the existing token, and the verify-token endpoint already exists).
- **6/7 real WISPACE tools for Discord** (`modules/wispace/` — `WispaceGoalsService`, `WispaceCalendarService`, `DiscordStudyCalendarCommandService`) — `get_user_goals`, `get_learning_progress_report` (returns raw goals+scores, the main LLM chat narrates itself — no separate port of `StudentReportService`'s LLM call), `get_upcoming_study_sessions`, `list_study_calendar_entries`, `preview_next_study_reminder` now call real Wispace API (`x-discordid`) when `ctx.userId` is resolved; if not linked, returns a Vietnamese "not yet linked" notification.
- **`reschedule_study_session` (DONE)** — Discord counterpart of Messenger postback confirm/cancel: `DiscordAgentToolsService` stages pending via `DiscordRescheduleConfirmationService` (Map by `discordUserId` + 10-minute TTL, same as Messenger's `MessengerRescheduleConfirmationService`), sends summary DM with 2 Discord buttons (`ActionRowBuilder`/`ButtonBuilder`, Success/Danger style) via `DiscordOutboundService.sendRescheduleConfirmation`. Button presses handled by Necord `@Button(customId)` decorator in `DiscordChatGateway` (`onRescheduleConfirm`/`onRescheduleCancel`), routed by `interaction.user.id` — simpler than Messenger because no payload encoding into customId needed. Writes real calendar via `DiscordStudyCalendarCommandService.rescheduleSession` (delete + create calendar, reusing `resolveRescheduleSlot`/`resolveScheduledAtFromEventDate` from `@wispace/wispace-client` + `formatScheduledTimeLabel`/`getMinutesUntilSession` from `@wispace/study-reminder-core`) — no outbox sync after rescheduling (Discord doesn't have its own study reminder job system yet).
- **Still stub: `register_exam_report_notifications` (decision: keep as-is, no code)** — this tool exists in Messenger to work around Meta's 24h messaging limit (must opt-in to "Notification Messages" to message beyond 24h since user's last message); Discord **does not have** this 24h limit, so the bot can DM at any time without any "registration." More importantly: Discord hasn't ported `ReportCronService` (cron that sends periodic AI reports before exam day) — even if we implemented "registration" now (default cadence=WEEKLY, matching Messenger's fallback default in `poc.constants.ts`), there's nothing to read it back and send reports, making it a half-baked feature. Only implement when porting the periodic report cron to Discord.
- Unit tests for `DiscordChatHistoryService`, `DiscordAgentToolsService` (including linked/unlinked cases for all tools + valid/error reschedule cases), `DiscordOutboundService` (including button-equipped confirm DMs), `WispaceDiscordTokenVerifyService`, `DiscordAccountLinkService`, `DiscordOauthController`, and `packages/wispace-client` (`UserGoalsApiClient`, `user-calendar-record.normalizer`, `buildWispaceHeaders`).

**Outstanding / technical debt:**
- **CI/CD deploy VPS** — `Dockerfile`, `docker-compose.prod.yml`, `deploy-discord-bot.yml`, `vps-deploy-discord.sh`, `health.controller.ts` written but not yet committed + not run in production on VPS.
- **End-to-end test not done** — needs a real Discord Application OAuth2 client + public HTTPS redirect URI + WISPACE backend displaying the "Connect Discord" link + confirmed real response shape from `WISPACE_API_VERIFY_TOKEN_URL`.
- `register_exam_report_notifications` — decision: keep as stub, only implement when `ReportCronService` (periodic report cron) is ported to Discord.
- Persistent chat history / multi-pod (Redis) if scaling to multiple instances is needed.
- Whitelist, quota-event audit table, stuck-reserved recovery, ops CLI for Discord (Messenger-only currently).
- `apps/messenger-bot`'s local `study-reminder/application/utils/study-calendar.utils.ts` duplicates `packages/wispace-client` — not yet deduplicated (deferred to avoid expanding Phase 3 scope).

**Verification done:** `npx turbo run format:check lint typecheck test build --filter=@wispace/messenger-bot... --filter=@wispace/discord-bot... --filter=@wispace/chat-metering... --filter=@wispace/wispace-client...` all passed (messenger-bot 304 tests + chat-metering 18 tests + wispace-client 10 tests + discord-bot 26 tests). Not yet tested with a real Discord server (needs real `DISCORD_BOT_TOKEN` + `MESSAGE CONTENT INTENT` enabled in Developer Portal), not yet tested with real DB connection (`DB_*` env) or real Wispace API (`WISPACE_API_*_URL` + `x-discordid`) for Discord, and not yet tested with real OAuth flow (needs public redirect URI + WISPACE backend displaying the "Connect Discord" link).

---

## Phase 4 — Deploy `apps/zalo-bot` (NOT DONE)

Similar to Phase 3, using the Zalo OA API instead of Discord REST API. Prioritized after Phase 3 stabilizes (lessons learned on how to adapt a new bot into `@wispace/llm-agent`).

---

## Phase 5 — Fully independent CI/CD per bot (NOT DONE)

**Goal:** each bot has its own build/test/deploy pipeline with no mutual dependencies.

**Work needed:**
- 3 separate workflows: `deploy-messenger-bot.yml`, `deploy-discord-bot.yml`, `deploy-zalo-bot.yml` — each with path-filter on `apps/<bot>/**` + `packages/llm-agent/**` (changing `packages/llm-agent` must trigger rebuild+redeploy for all 3 bots, or use Turborepo remote caching to only rebuild the bots that actually need it).
- **DB migration convention:** only 1 pipeline (Messenger bot, since it has the longest production history) is allowed to run `migration:run`; other bots only read the schema and never run migrations themselves — avoids race conditions when 3 CI pipelines run in parallel against the same DB.
- Separate secrets/env per bot via Doppler (Discord bot token, Zalo OA token...).
- Separate Docker image + deploy target per bot on VPS (or split hosts if independent scaling is needed).

**Verification:** trigger independent deploy for each bot (change only 1 app, confirm only the corresponding pipeline runs — unless `packages/llm-agent` is changed, in which case all 3 rebuild).

---

## Summary by status

| Phase | Content | Status |
|-------|---------|--------|
| 0 | Initial baseline | Reference |
| 1 | Turborepo scaffold + extract `packages/llm-agent` + discord/zalo placeholder | ✅ Done |
| 2 | Generalize DB keys `(platform, external_user_id)` | ✅ Done — migration run on production VPS, verified via SSH |
| 3 | Deploy Discord bot | 🟡 Features done (chat + quota + OAuth2 account-linking + 6/7 real tools + reschedule with Discord buttons) — CI/CD deploy VPS in progress (Dockerfile + compose + workflow not yet committed), end-to-end testing not done (needs bot token + public OAuth redirect) |
| 4 | Deploy Zalo bot | ⏳ Not done |
| 5 | Fully independent CI/CD | 🟡 Discord workflow in progress (`deploy-discord-bot.yml`, `vps-deploy-discord.sh`) — Messenger workflow not yet separated |
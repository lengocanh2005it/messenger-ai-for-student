# AGENTS.md

Guidelines for AI coding agents working in the **wispace-bots** repo — Turborepo monorepo for WISPACE student bots (AI reports + study reminders + chat AI rate limiting). Currently has `apps/messenger-bot` (fully featured), `apps/discord-bot` (chat + quota/usage/safety via `packages/chat-metering` + account-linking OAuth2 + 6/7 real tool handlers via `packages/wispace-client` done, including `reschedule_study_session` via Discord button confirm/cancel — `register_exam_report_notifications` is a stub — Messenger needs it to work around Meta's 24h messaging limit (Discord has no such limit) and Discord hasn't ported the periodic report cron yet, see `docs/turborepo-migration-plan.md` Phase 3), `apps/zalo-bot` (placeholder, not implemented yet), `packages/llm-agent` (function-calling + OpenAI API calls shared across all bots), `packages/chat-metering` (quota/rate-limit + LLM usage/safety event tracking shared across all bots), `packages/wispace-client` (Wispace API HTTP client for goals/scores/calendar shared across all bots), `packages/chat-history` (in-memory chat history store with TTL + turn cap shared across all bots), `packages/student-report` (generates student capability reports — fetch capacity + call LLM + fallback + format — shared across all bots), `packages/chat-queue-core` (debounce/merge state machine per user, shared across all bots — idempotency key resolved by each platform at the ingestion layer), and `packages/study-reminder-core` (pure functions for calculating study reminder schedules: remind_at, session-started, time label).

Read this file before modifying code. Deep details are in `docs/` — only read when the task requires it. Full monorepo roadmap (Discord/Zalo, multi-platform DB, independent CI/CD): [docs/turborepo-migration-plan.md](docs/turborepo-migration-plan.md).

**Note on paths:** most of the content below (modules, `npm run ...` commands, `src/...` paths) describes `apps/messenger-bot/` — run those commands **inside the `apps/messenger-bot/` directory**, or use `npx turbo run <script> --filter=@wispace/messenger-bot...` from root.

---

## Project overview

| | |
|---|---|
| **Stack** | NestJS 11, TypeScript, TypeORM, PostgreSQL, OpenAI |
| **Goal** | IELTS students link `m.me` ↔ WISPACE, receive progress reports and study session reminders via Messenger |
| **Scope** | Small backend service — **not** full-stack, **not** a standalone microservice |
| **DB** | PostgreSQL **`ai_chat_bot_db`** (dedicated POC); Wispace data via **HTTP API**; user name cache: `users` table + `"Users"` view |
| **Principles** | Small diffs, reuse existing modules, config via `.env`; Redis optional (R0–R4) when scaling / on VPS |

---

## Dev environment tips

- Copy `.env.example` → `.env` and fill in real tokens before running sync/cron — or use [Doppler](apps/messenger-bot/docs/doppler-secrets.md): `doppler setup` + `npm run start:dev:doppler`.
- **Prod DB:** `DB_NAME=ai_chat_bot_db` (no longer `writing_ai_hub_db`).
- Meta webhook needs a public URL (ngrok/tunnel) pointing to `POST /webhook`.
- After first deploy: call `POST /messenger/profile/setup` (header `X-Internal-Api-Key`) — prod menu only has **Register for reports** (bot auto-sends reports/reminders).
- Editing files in `apps/messenger-bot/src/shared/prompts/*.system.txt` → **requires** `npm run build` (Nest copies assets to `dist/shared/prompts/`).
- Study reminder: `STUDY_REMINDER_*` variables are **mandatory** — use `readRequiredPositiveNumber`, do not hardcode fallbacks in code.
- Wispace API auth: header **`x-psid`** (Messenger PSID) + **`X-Internal-Key`** (`WISPACE_INTERNAL_KEY`); mapping link **requires** token verification via **`POST WISPACE_API_VERIFY_TOKEN_URL`** (shared across 3 bots, body `{token, value, platform}`; `MESSENGER_LINK_MODE=token`; startup fails if config is missing).
- Ops HTTP (`/messenger/study-calendar/sync`, `send-reports`, …) require header **`X-Internal-Api-Key`** or `Authorization: Bearer …` matching `INTERNAL_API_KEY`.
- Internal cron (30-minute sync, adaptive S2 dispatch) runs in-process — no API key needed.
- Debug reminder jobs: `npm run study-reminder:jobs` (`--failed`, `--stuck`, `--summary`).
- Query chat quota: `npm run chat-quota:status` (`--psid`, `--user-id`, `--date`, `--ops`); rebuild counter: `chat-quota:rebuild` (`--dry-run`).
- Query LLM tokens: `npm run llm-usage:status` (`--psid`, `--feature`, `--ops`); HTTP ops `GET /messenger/ops/llm-usage/summary` (`psid` \| `userId`, `from`, `to`) and `GET /messenger/ops/llm-usage/fleet` (`date`); USD pricing: `LLM_COST_USD_PER_1M_*_GPT_5_4` = `2.50` / `15.00` (OpenAI Standard gpt-5.4); persisted via BullMQ queue `llm-usage-write` when `REDIS_ENABLED=true`.
- Cap concurrent OpenAI (1 instance): `LLM_EXECUTION_ENABLED=true`, `LLM_MAX_CONCURRENT` (default `3`) — `LlmExecutionModule`; quick disable: `LLM_EXECUTION_ENABLED=false`.
- LLM safety: free-form chat blocks prompt-injection before calling OpenAI, sanitizes history/tool results; external data for reminders/reports must go through `prompt-injection.utils` / validate JSON output (`llm-json-output.utils`) before formatting/sending.
- Ops health I1+S1: `npm run ops:health` (cron 09:00 ICT in-app when `OPS_HEALTH_ALERT_ENABLED=true`).
- Doppler prod webhook: update `prd` secret → `POST /messenger/ops/doppler-sync` auto-syncs `.env` + restarts container ([doppler-secrets.md](apps/messenger-bot/docs/doppler-secrets.md) §4).
- Audit log cleanup: cron `messenger-message-log-cleanup` — 03:00 ICT every Monday; `MESSENGER_MESSAGE_LOG_RETENTION_DAYS=90` (disable: `MESSENGER_MESSAGE_LOG_CLEANUP_ENABLED=false`).
- Redis R0: `REDIS_ENABLED=true` + `REDIS_*` → startup logs PING; `GET /health/redis` (503 when enabled but not connected).
- Redis R5: `USER_DISPLAY_NAME_CACHE_*` — caches `cache:user:display:{userId}` before querying `users` table / `"Users"` view.
- Chat history R1: `CHAT_HISTORY_STORE=redis` (requires `REDIS_ENABLED=true`) \| `memory` (postgres table removed).
- Webhook dedupe R2: `CHAT_DEDUPE_STORE=redis` \| `memory` (no longer using postgres / `messenger_chat_webhook_seen` table).
- Burst counter R3: `CHAT_BURST_STORE=redis` \| `memory` \| `postgres` (default `postgres`).
- Chat queue R4: `CHAT_QUEUE_STORE=redis` \| `memory` — debounce buffer; `CHAT_QUEUE_SHARED=true` maps to `redis` (H7 legacy).
- Bootstrap jobs on first run: `npm run study-reminder:sync`.

---

## Build commands

From root (Turborepo, builds `packages/llm-agent` first per dependsOn `^build`):

```bash
npm install
npx turbo run build --filter=@wispace/messenger-bot...
npx turbo run test --filter=@wispace/messenger-bot...
```

From `apps/messenger-bot/` (commands below, same as pre-migration):

```bash
npm run start:dev          # dev server (watch)
npm run build              # compile + copy prompts → dist/
npm run start:prod         # node dist/main
npm run migration:run      # build + run TypeORM migrations
npm run migration:revert   # revert last migration
npm run migration:show     # show migration status
npm run lint               # eslint --fix
npm run format             # prettier --write
npm run format:check       # prettier --check (CI / verify)
npm run typecheck          # tsc --noEmit
npm run verify             # format:check + lint + typecheck + test + build
```

### Utility scripts (require `.env` + DB)

```bash
npm run db:inspect
npm run db:explore-study-schedule
npm run study-reminder:sync-only    # sync jobs, no migrate
npm run study-reminder:sync         # build + migrate + sync + dispatch
npm run study-reminder:jobs         # print jobs in DB (--failed, --stuck, --summary)
npm run ops:health                  # I1+S1 combined ops snapshot
npm run chat-quota:status           # query chat quota (psid / userId / date / --ops)
npm run chat-quota:rebuild            # rebuild counter from messenger_chat_events (--dry-run)
npm run llm-usage:status              # query LLM tokens by feature/psid (--ops)
npm run chat-quota:recover-stuck    # H2: refund stuck reserved (optional --dry-run)
npm run chat-quota:cleanup          # H6: delete old completed/refunded idempotency (optional --dry-run)
# Ops DB migrate (one-time, requires DB_HOST + DB_USER + DB_PASSWORD):
node scripts/migrate-hub-to-chat-bot-db.mjs   # writing_ai_hub_db → ai_chat_bot_db
node scripts/drop-poc-tables-old-db.mjs       # drop POC tables + migrations on old DB
```

---

## Testing instructions

```bash
npm run test                # Jest, specs in src/**/*.spec.ts
npm run test:watch
npm run test:cov
npm run test:e2e            # test/app.e2e-spec.ts
```

**When to add/update tests:**

- Modifying `remind_at` calculation logic → update `study-reminder-schedule.service.spec.ts`
- Modifying job upsert on schedule change → `study-reminder-job.repository.spec.ts`
- Modifying ops API guard → `internal-api-key.guard.spec.ts`
- Modifying `ref` parsing / `m.me` link → `poc.constants.spec.ts`

Before finishing a task (code changes): **you must** update related agent docs/skills (see *Docs & skills when changing code* section) and run tests/build.

**Required after every code change — matching CI deploy (in this exact order):**

```bash
npm ci                     # required if you just ran npm ci --omit=dev
npm run format:check       # prettier --check — CI fails on bad format
npm run lint               # eslint --fix
npm run typecheck          # tsc --noEmit
npm run test               # Jest — 377 specs
npm run build              # nest build + copy assets → dist/
```

> Skipping any step can cause CI failure. The order above matches the `quality` jobs in `.github/workflows/deploy.yml`.

**Full local verification (recommended):** `npm run format` then `npm run verify`.

Fix lint/test/build errors until all pass. `npm run test:e2e` requires a real PostgreSQL — not part of CI gate.

### Common CI pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Jest passes locally but CI hangs then fails after ~30s | Service has `setInterval` / `setTimeout` not cleared → open handle | Add `OnModuleDestroy` + `clearInterval`; `npm run test` runs `jest --runInBand` and doesn't use `forceExit` |
| `prettier --check` fails despite no local errors | File has CRLF (Windows) but Prettier config expects LF | Run `npm run format` before committing |
| `eslint` reports `no-useless-escape` | Regex uses `\/` or `\-` inside character class | Remove backslash: `[/-]` instead of `[\/\-]` |
| Test passes locally but fails CI due to date/time | CI runs UTC, local runs UTC+7 | Don't hardcode dates — use `new Date()` or mock `Date.now` |

**Rules when adding new services with timers/intervals:**
- `collectDefaultMetrics()` from `prom-client`, `setInterval`, long `setTimeout` → **you must** implement `OnModuleDestroy` and clear in `onModuleDestroy()`
- `prom-client` Registry: call `this.registry.clear()` on destroy to clean up collectors

Existing specs:

- `apps/messenger-bot/src/modules/chat-rate-limit/application/services/chat-rate-limit.service.spec.ts`
- `apps/messenger-bot/src/modules/chat-rate-limit/infrastructure/persistence/chat-rate-limit.repository.spec.ts`
- `apps/messenger-bot/src/modules/messenger/application/services/messenger-chat-queue.service.spec.ts`
- `apps/messenger-bot/src/modules/messenger/application/services/messenger-chat-queue.service.shared.spec.ts`
- `apps/messenger-bot/src/modules/messenger/application/services/messenger-message-log-cleanup.service.spec.ts`
- `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.spec.ts`
- `apps/messenger-bot/src/modules/study-reminder/application/services/study-reminder-schedule.service.spec.ts`
- `apps/messenger-bot/src/modules/study-reminder/application/services/study-reminder.service.spec.ts`
- `apps/messenger-bot/src/modules/study-reminder/application/services/study-reminder-cleanup.service.spec.ts`
- `apps/messenger-bot/src/modules/student-report/application/services/student-report.service.spec.ts`
- `apps/messenger-bot/src/shared/common/guards/internal-api-key.guard.spec.ts`
- `apps/messenger-bot/src/shared/config/poc.constants.spec.ts`
- `apps/messenger-bot/src/shared/utils/prompt-injection.utils.spec.ts`
- `src/app.controller.spec.ts`

---

## Docs & skills when changing code

Same PR/task as code — update the **agent** docs (not just long `docs/`) so the AI doesn't make mistakes next time.

| Change | Minimum update |
|--------|----------------|
| Ops API / webhook / Messenger menu | `apps/messenger-bot/docs/project-overview.md`, `AGENTS.md` (API/cron), rule `messenger-chat.md` if chat queue |
| Persistent menu / `profile/setup` | `apps/messenger-bot/docs/project-overview.md`, menu section in `AGENTS.md` dev tips |
| Rate limit / quota / idempotency | `apps/messenger-bot/docs/chat-rate-limit-quota.md`, `.claude/rules/chat-rate-limit.md`, skill `/verify` if adding ops steps |
| Study reminder / sync / dispatch | `apps/messenger-bot/docs/study-session-reminder.md`, `.claude/rules/study-reminder.md`, skill `/study-reminder-debug` |
| Entity / migration / DB split | `.claude/rules/database.md`, skill `/typeorm-migration`, `.env.example` if adding variables |
| Removing DB UserCalendars fallback (I3) | `user-calendar-schedule.service.ts`, `apps/messenger-bot/docs/study-session-reminder.md`, `apps/messenger-bot/docs/edge-cases-roadmap.md` |
| LLM system prompt | `apps/messenger-bot/src/shared/prompts/*.system.txt`, skill `/edit-llm-prompt` |
| Deploy / CI / VPS path | `.github/workflows/deploy.yml`, `apps/messenger-bot/docs/c2-master-implementation-plan.md`, `apps/messenger-bot/docs/doppler-secrets.md`, `apps/messenger-bot/docs/scale-phase-b-runbook.md`, `deploy/nginx/` |
| New env var | `.env.example` + corresponding line in `apps/messenger-bot/docs/project-overview.md` or `AGENTS.md` |
| Meta webhook signature / `MESSENGER_APP_SECRET` | `apps/messenger-bot/docs/project-overview.md`, `apps/messenger-bot/docs/edge-cases-roadmap.md` §1, `AGENTS.md` Security |
| Closed gaps / roadmap | `apps/messenger-bot/docs/edge-cases-roadmap.md`, Integration gaps table in `AGENTS.md` |

Skill `/verify` — run at the end of every task that modifies code.

---

## Clean Architecture

Repo uses **feature modules + 4 layers** (presentation → application → domain ← infrastructure). Details: `.claude/rules/clean-architecture.md`.

### Dependency flow

- **Domain** — pure types, repository interfaces (no NestJS/TypeORM).
- **Application** — services / use cases, cross-module ports (`Symbol` + `@Inject`).
- **Infrastructure** — TypeORM repo impl, Wispace/Meta HTTP, OpenAI callers.
- **Presentation** — controllers (thin, delegate down to application).

### Cross-module ports

| Token | Use when |
|-------|----------|
| `MESSENGER_REPOSITORY` | Read/write mappings, logs |
| `MESSENGER_MAPPING_READER` | Study reminder sync / display name |
| `MESSAGE_SENDER` | Send Messenger messages (dispatch, don't import `MessengerService`) |

`StudyReminderModule` imports `MessengerOutboundModule` — **not** `forwardRef` with `MessengerModule`.

---

## Project structure

```
src/
├── main.ts, app.module.ts, app.controller.ts
├── shared/
│   ├── config/              # poc.constants (m.me, parse ref)
│   ├── common/              # InternalApiKeyGuard
│   └── prompts/             # *.system.txt, load-system-prompt.ts
├── infrastructure/
│   └── database/            # TypeORM entities, migrations, DatabaseModule
└── modules/
    ├── messenger/           # domain | application | infrastructure | presentation
    │   └── messenger-outbound.module.ts   # Send API + mapping (breaks cycle)
    ├── chat-rate-limit/    # daily quota + idempotency (H2–H7)
    ├── student-report/
    ├── study-reminder/
    └── scheduler/           # cron + ops HTTP /messenger/*
docs/                        # Detailed docs — read by task
scripts/                     # CLI debug (not run during app runtime)
```

Each feature in `modules/<name>/`:

```
domain/entities|repositories/ → application/services|ports/ → infrastructure/ → presentation/controllers/
```

### Module → responsibilities

| Module | Role |
|--------|------|
| `ChatRateLimitModule` | FREE_FORM quota: reserve/refund/burst, hard cap H3, ops recover H2 |
| `MessengerModule` | Webhook, profile menu, chat queue + agent, shared queue H7 |
| `MessengerOutboundModule` | Send API, `MessengerRepository`, ports |
| `StudentReportModule` | Wispace goals/scores → LLM report generation |
| `StudyReminderModule` | Sync/dispatch/cleanup jobs, LLM study reminders |
| `SchedulerModule` | `ReportCronService` + HTTP ops endpoints |
| `DatabaseModule` | TypeORM + PostgreSQL |

`AppModule` imports `StudyReminderModule` directly (not just transitively).

---

## Code style & conventions

- **Language:** TypeScript, NestJS 11, TypeORM.
- **User-facing messages:** Vietnamese.
- **Log / comments:** English or short Vietnamese — only when logic isn't self-evident.
- **Config:** `ConfigService` + `.env`; adding new variables → update `.env.example`.
- **Migration:** `apps/messenger-bot/src/infrastructure/database/migrations/`, entities in `apps/messenger-bot/src/infrastructure/database/entities/`.
- **Prompts:** `apps/messenger-bot/src/shared/prompts/` — don't inline long system prompts in services.
- **Cross-module:** inject ports (`@Inject(TOKEN)`), use `import type` for interfaces.

### Anti-patterns (avoid)

| Don't | Instead |
|-------|---------|
| Stuffing study reminder logic into `MessengerService` | `StudyReminderService` / worker |
| `StudyReminderModule` importing `MessengerModule` | `MessengerOutboundModule` + ports |
| `@Entity()` in `domain/` | ORM entities in `infrastructure/database/entities/` |
| Hardcoding reminder lead time | `StudyReminderScheduleService` + `.env` |
| Adding Bull/SQS/Redis queues | `study_reminder_jobs` table (outbox POC) |
| Hardcoding tokens/API keys | `.env` + `ConfigService` |
| Committing `.env` | Only `.env.example` |

---

## Task → file (quick routing)

| Task | Primary file |
|------|-------------|
| Add menu postback | `infrastructure/meta/messenger-profile.service.ts`, `application/services/messenger.service.ts` |
| Change AI report content | `shared/prompts/student-report.system.txt`, `student-report/.../student-report.service.ts` |
| Change study reminder content | `shared/prompts/study-reminder.system.txt`, `study-reminder/.../study-reminder.service.ts` |
| Change lead time / horizon / retention | `.env`, `study-reminder-schedule.service.ts` |
| Add table migration | `infrastructure/database/migrations/`, `entities/` |
| Wispace schedule change → sync | `scheduler/.../scheduler.controller.ts` → `StudyReminderSyncService` |
| UserCalendar API client | `study-reminder/infrastructure/wispace/user-calendar-api.service.ts` |
| Send message from another module | Inject `MESSAGE_SENDER`, not `MessengerService` |
| Full sync (ops) | `POST /messenger/sync-study-reminders`, `scripts/sync-study-reminder-jobs.mjs` |
| Chat rate limit | `ChatRateLimitService`, `MessengerChatQueueService`, [chat-rate-limit-quota.md](apps/messenger-bot/docs/chat-rate-limit-quota.md) |
| Shared queue multi-pod (H7/R4) | `CHAT_QUEUE_STORE` / `CHAT_QUEUE_SHARED`, `CHAT_QUEUE_STORE` port, `MessengerChatQueueWorkerService` |
| Ops quota scripts | `scripts/chat-quota-status.mjs`, `chat-quota-recover-stuck.mjs`, `chat-quota-cleanup-idempotency.mjs` |

---

## Data flows (summary)

### User linking

`ref` query param = WISPACE `userId` → saved to `user_messenger_mappings` (`psid` + `user_id`).

### Learning reports

```
UserGoalsApiService + TaskScoreAverageApiService
  → StudentReportService (LLM)
  → MessengerService.sendTextViaPsid
```

Triggered by: cron 08:00, menu postback, or `POST /messenger/send-reports`.

### Study reminders

```
Wispace schedule change → POST /messenger/study-calendar/sync { userId }
  → StudyReminderSyncService (GET UserCalendar, x-psid)
  → study_reminder_jobs
  → StudyReminderDispatchService (adaptive poll S2)
  → StudyReminderService (LLM) + MESSAGE_SENDER (MessengerOutbound)
```

### Free-form chat (FREE_FORM)

```
Webhook text → dedupe mid (`CHAT_DEDUPE_STORE` memory/postgres/redis)
  → MessengerChatQueueService.enqueue → debounce flush
  → ChatRateLimitService.reserve (DB idempotency + daily usage, hard cap H3)
  → MessengerAgentService (LLM) → Send API
  → markCompleted; error before bubble → refund (H4)
```

Menu postback and proactive messages do **not** go through `ChatRateLimitService`. Enforcement: `CHAT_RATE_LIMIT_ENABLED=true`.

Wispace **must** call the sync API after POST/DELETE `/api/UserCalendar`. The 30-minute cron is only a fallback — it does not replace the webhook/event bus.

---

## Security

- **Never** commit secrets: `.env`, Meta/OpenAI tokens, `INTERNAL_API_KEY`, DB password.
- Ops endpoints protected by `InternalApiKeyGuard` — don't remove the guard when adding ops endpoints.
- Wispace API: only header `x-psid`, never store/log full user access tokens.
- Meta webhook: verify via `VERIFY_TOKEN` (GET `/webhook`); POST `/webhook` verifies `X-Hub-Signature-256` with `MESSENGER_APP_SECRET` (disable: `MESSENGER_WEBHOOK_SIGNATURE_VERIFY=false`). `ENFORCE_PROD_CHAT_QUOTA=true` or `NODE_ENV=production` → startup fails if secret is missing / verify disabled / `CHAT_RATE_LIMIT_ENABLED=false`.
- LLM prompt-injection: don't pass user/Wispace strings directly into prompts or tool results. Use `sanitizeUntrustedTextForLlm` / `sanitizeToolResultContent`; JSON output from OpenAI must be parsed + shape-validated, fall back to template on error.

---

## Documentation index (read by task)

| Priority | File | When to read |
|----------|------|-------------|
| 1 | [apps/messenger-bot/docs/project-overview.md](apps/messenger-bot/docs/project-overview.md) | First time entering repo — architecture, API, cron |
| 2 | [apps/messenger-bot/docs/study-session-reminder.md](apps/messenger-bot/docs/study-session-reminder.md) | Modifying reminders, jobs, sync, dispatch, rollover |
| 3 | [apps/messenger-bot/docs/chat-rate-limit-quota.md](apps/messenger-bot/docs/chat-rate-limit-quota.md) | Two-way chatbot, rate limiting, quota |
| 4 | [apps/messenger-bot/docs/edge-cases-roadmap.md](apps/messenger-bot/docs/edge-cases-roadmap.md) | Gaps & remediation phases for entire POC (beyond chat H1–H7) |
| 5 | `.env.example` | Required environment variables |
| 6 | `apps/messenger-bot/src/shared/config/poc.constants.ts` | `m.me` links, parse `userId` from `ref` |
| — | `.claude/rules/clean-architecture.md` | Modifying/adding code in `apps/messenger-bot/src/modules/` |
| — | `.claude/rules/chat-rate-limit.md` | Modifying `apps/messenger-bot/src/modules/chat-rate-limit/**` |
| — | `.claude/rules/messenger-chat.md` | Modifying chat queue/history/worker |

### Claude Code (`.claude/`)

| Path | Purpose |
|------|---------|
| `CLAUDE.md` | Context loaded each session |
| `.claude/settings.json` | Permissions (npm/git allow; `.env` deny) |
| `.claude/rules/` | `project-conventions`, `clean-architecture`, `chat-rate-limit`, `messenger-chat`, `study-reminder`, `database`, `prompts` |
| `.claude/skills/` | `/study-reminder-debug`, `/typeorm-migration`, `/edit-llm-prompt`, `/verify` |

Cursor uses `AGENTS.md` + `.cursor/rules/` (rule `change-workflow`) + global skills `~/.cursor/skills-cursor/` + `.claude/skills/`.

---

## Integration gaps (don't assume these are done)

| Gap | POC Status |
|-----|------------|
| `POST /messenger/study-calendar/sync` | ✓ Endpoint + sync by `userId` |
| Auth ops (`INTERNAL_API_KEY`) | ✓ Header `X-Internal-Api-Key` or Bearer |
| Wispace wire sync after schedule change | ✓ Calls `POST /messenger/study-calendar/sync` + `X-Internal-Api-Key` |
| Student name for LLM | ✓ `users` table + `"Users"` view on `ai_chat_bot_db` (`DisplayName` → `'Chào bạn nha'`) |
| DB POC separated from `writing_ai_hub_db` | ✓ `ai_chat_bot_db` + migrate/drop scripts on old hub |
| Upsert `sent` job when rescheduling same `session_key` | ✓ `StudyReminderJobRepository.upsertPendingJob` reopens → `pending` |
| Mapping change `user_id` for same PSID (L3) | ✓ Webhook blocked; ops `POST /messenger/mapping/relink` + `allowRelink` |
| 1:1 mapping `userId` ↔ `psid` (L4) | ✓ Token-only link + relink webhook blocked; ACTIVE unique index on DB |
| Multi-pod cron 08:00 report (R4) | ✓ Claim table + advisory lock + `CRON_LEADER_ENABLED` |
| Two-way chat + rate limit V1 | ✓ Reserve/refund/burst/whitelist/hint |
| Rate limit hardening H1–H7 | ✓ H2–H7 code; H1 = enable `CHAT_RATE_LIMIT_ENABLED` on prod env |
| Tier / event store (Phase 7–8) | ✗ Optional — master plan [c2-master-implementation-plan.md](apps/messenger-bot/docs/c2-master-implementation-plan.md); full §5.8 [chat-rate-limit-quota.md](apps/messenger-bot/docs/chat-rate-limit-quota.md) |
| Project-wide gaps (linking, reports, reminders, ops) | Roadmap — [edge-cases-roadmap.md](apps/messenger-bot/docs/edge-cases-roadmap.md) |

When closing a gap: update `apps/messenger-bot/docs/study-session-reminder.md` and the table above.

---

## Boundaries — do not do these unless the user requests

- Commit / push git
- Create markdown files outside `docs/` or edit lengthy READMEs unnecessarily
- Add message queues (Bull, SQS, Redis)
- Force push, modify git config

---

## PR / commit guidelines

- Only commit when the user explicitly requests it.
- Never commit `.env` or files containing secrets.
- Commit messages: short, describe **why** more than **what**.
- Before PR: run all 5 CI commands in order `format:check → lint → typecheck → test → build`; locally recommended `npm run verify`.

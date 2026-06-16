# AGENTS.md

Hướng dẫn cho AI coding agents làm việc trong repo **demo_send_message_fb** — POC NestJS gửi tin Facebook Messenger cho học viên WISPACE (báo cáo AI + nhắc lịch học + chat AI rate limit).

Đọc file này trước khi sửa code. Chi tiết sâu nằm trong `docs/` — chỉ đọc khi task liên quan.

---

## Project overview

| | |
|---|---|
| **Stack** | NestJS 11, TypeScript, TypeORM, PostgreSQL, OpenAI |
| **Mục tiêu** | Học viên IELTS liên kết `m.me` ↔ WISPACE, nhận báo cáo tiến độ và nhắc buổi học qua Messenger |
| **Phạm vi** | Backend service nhỏ — **không** full-stack, **không** microservice riêng |
| **DB** | PostgreSQL **`ai_chat_bot_db`** (dedicated POC); Wispace data qua **HTTP API**; cache tên user: bảng `users` + view `"Users"` |
| **Nguyên tắc** | Diff nhỏ, tái dùng module hiện có, config qua `.env`; Redis optional (R0–R4) khi scale / VPS |

---

## Dev environment tips

- Copy `.env.example` → `.env` và điền token thật trước khi chạy sync/cron — hoặc [Doppler](docs/doppler-secrets.md): `doppler setup` + `npm run start:dev:doppler`.
- **DB prod:** `DB_NAME=ai_chat_bot_db` (không còn `writing_ai_hub_db`).
- Webhook Meta cần URL public (ngrok/tunnel) trỏ tới `POST /webhook`.
- Sau lần deploy đầu: gọi `POST /messenger/profile/setup` (header `X-Internal-Api-Key`) — menu prod chỉ **Đăng ký báo cáo** (báo cáo/nhắc lịch bot gửi tự động).
- Sửa file trong `src/shared/prompts/*.system.txt` → **bắt buộc** `npm run build` (Nest copy assets sang `dist/shared/prompts/`).
- Study reminder: biến `STUDY_REMINDER_*` **bắt buộc** — dùng `readRequiredPositiveNumber`, không hardcode fallback trong code.
- Wispace API auth bằng header **`x-psid`** (PSID Messenger), không dùng user access token.
- Ops HTTP (`/messenger/study-calendar/sync`, `send-reports`, …) cần header **`X-Internal-Api-Key`** hoặc `Authorization: Bearer …` khớp `INTERNAL_API_KEY`.
- Cron nội bộ (sync 30 phút, dispatch adaptive S2) chạy trong process — không qua API key.
- Debug jobs nhắc lịch: `npm run study-reminder:jobs` (`--failed`, `--stuck`, `--summary`).
- Tra quota chat: `npm run chat-quota:status` (`--psid`, `--user-id`, `--date`, `--ops`).
- Ops health I1+S1: `npm run ops:health` (cron 09:00 ICT trong app khi `OPS_HEALTH_ALERT_ENABLED=true`).
- Audit log cleanup: cron `messenger-message-log-cleanup` — 03:00 ICT ngày 1 hàng tháng; `MESSENGER_MESSAGE_LOG_RETENTION_DAYS=90` (tắt: `MESSENGER_MESSAGE_LOG_CLEANUP_ENABLED=false`).
- Redis R0: `REDIS_ENABLED=true` + `REDIS_*` → startup log PING; `GET /health/redis` (503 khi bật mà không kết nối được).
- Redis R5: `USER_DISPLAY_NAME_CACHE_*` — cache `cache:user:display:{userId}` trước bảng `users` / view `"Users"`.
- Chat history R1: `CHAT_HISTORY_STORE=redis` (cần `REDIS_ENABLED=true`) \| `memory` (postgres table removed).
- Webhook dedupe R2: `CHAT_DEDUPE_STORE=redis` \| `memory` (không còn postgres / bảng `messenger_chat_webhook_seen`).
- Burst counter R3: `CHAT_BURST_STORE=redis` \| `memory` \| `postgres` (mặc định `postgres`).
- Chat queue R4: `CHAT_QUEUE_STORE=redis` \| `memory` — debounce buffer; `CHAT_QUEUE_SHARED=true` map `redis` (H7 legacy).
- Bootstrap jobs lần đầu: `npm run study-reminder:sync`.

---

## Build commands

```bash
npm install
npm run start:dev          # dev server (watch)
npm run build              # compile + copy prompts → dist/
npm run start:prod         # node dist/main
npm run migration:run      # build + chạy TypeORM migrations
npm run migration:revert   # revert migration cuối
npm run migration:show     # xem trạng thái migrations
npm run lint               # eslint --fix
npm run format             # prettier --write
npm run format:check       # prettier --check (CI / verify)
npm run typecheck          # tsc --noEmit
npm run verify             # format:check + lint + typecheck + test + build
```

### Scripts tiện ích (cần `.env` + DB)

```bash
npm run db:inspect
npm run db:explore-study-schedule
npm run study-reminder:sync-only    # sync jobs, không migrate
npm run study-reminder:sync         # build + migrate + sync + dispatch
npm run study-reminder:jobs         # in jobs trong DB (--failed, --stuck, --summary)
npm run ops:health                  # I1+S1 combined ops snapshot
npm run chat-quota:status           # tra quota chat (psid / userId / ngày / --ops)
npm run chat-quota:recover-stuck    # H2: refund stuck reserved (optional --dry-run)
npm run chat-quota:cleanup          # H6: xóa idempotency completed/refunded cũ (optional --dry-run)
# Ops DB migrate (một lần, cần DB_PASSWORD):
node scripts/migrate-hub-to-chat-bot-db.mjs   # writing_ai_hub_db → ai_chat_bot_db
node scripts/drop-poc-tables-old-db.mjs       # xóa bảng POC + migrations trên DB cũ
```

---

## Testing instructions

```bash
npm run test                # Jest, spec trong src/**/*.spec.ts
npm run test:watch
npm run test:cov
npm run test:e2e            # test/app.e2e-spec.ts
```

**Khi nào thêm/sửa test:**

- Sửa logic tính `remind_at` → cập nhật `study-reminder-schedule.service.spec.ts`
- Sửa upsert job khi đổi lịch → `study-reminder-job.repository.spec.ts`
- Sửa guard ops API → `internal-api-key.guard.spec.ts`
- Sửa parse `ref`/link `m.me` → `poc.constants.spec.ts`

Trước khi kết thúc task (sửa code): **bắt buộc** cập nhật agent docs/skills liên quan (mục *Docs & skills khi đổi code*) và chạy test/build.

**Tối thiểu — khớp CI deploy:**

```bash
npm ci                     # bắt buộc nếu vừa npm ci --omit=dev
npm run lint
npm run test               # Jest — lệnh test chuẩn của project
npm run build
```

**Local đầy đủ (khuyến nghị):** `npm run format` rồi `npm run verify`.

Sửa lỗi lint/test/build cho đến khi pass. `npm run test:e2e` cần PostgreSQL thật — không nằm trong gate CI.

Spec hiện có:

- `src/modules/chat-rate-limit/application/services/chat-rate-limit.service.spec.ts`
- `src/modules/chat-rate-limit/infrastructure/persistence/chat-rate-limit.repository.spec.ts`
- `src/modules/messenger/application/services/messenger-chat-queue.service.spec.ts`
- `src/modules/messenger/application/services/messenger-chat-queue.service.shared.spec.ts`
- `src/modules/messenger/application/services/messenger-message-log-cleanup.service.spec.ts`
- `src/modules/study-reminder/application/services/study-reminder-schedule.service.spec.ts`
- `src/modules/study-reminder/application/services/study-reminder-cleanup.service.spec.ts`
- `src/shared/common/guards/internal-api-key.guard.spec.ts`
- `src/shared/config/poc.constants.spec.ts`
- `src/app.controller.spec.ts`

---

## Docs & skills khi đổi code

Cùng PR/task với code — cập nhật hàng **agent** (không chỉ `docs/` dài) để lần sau AI không làm sai.

| Thay đổi | Cập nhật tối thiểu |
|----------|-------------------|
| API ops / webhook / menu Messenger | `docs/project-overview.md`, `AGENTS.md` (API/cron), rule `messenger-chat.md` nếu chat queue |
| Persistent menu / `profile/setup` | `docs/project-overview.md`, mục menu trong `AGENTS.md` dev tips |
| Rate limit / quota / idempotency | `docs/chat-rate-limit-quota.md`, `.claude/rules/chat-rate-limit.md`, skill `/verify` nếu thêm bước ops |
| Study reminder / sync / dispatch | `docs/study-session-reminder.md`, `.claude/rules/study-reminder.md`, skill `/study-reminder-debug` |
| Entity / migration / tách DB | `.claude/rules/database.md`, skill `/typeorm-migration`, `.env.example` nếu thêm biến |
| System prompt LLM | `src/shared/prompts/*.system.txt`, skill `/edit-llm-prompt` |
| Deploy / CI / VPS path | `.github/workflows/deploy.yml`, `docs/project-overview.md` runbook, `docs/doppler-secrets.md` |
| Env mới | `.env.example` + dòng tương ứng trong `docs/project-overview.md` hoặc `AGENTS.md` |
| Webhook Meta signature / `MESSENGER_APP_SECRET` | `docs/project-overview.md`, `docs/edge-cases-roadmap.md` §1, `AGENTS.md` Security |
| Gap / roadmap đã đóng | `docs/edge-cases-roadmap.md`, bảng Integration gaps trong `AGENTS.md` |

Skill `/verify` — chạy cuối mọi task có sửa code.

---

## Clean Architecture

Repo dùng **feature modules + 4 tầng** (presentation → application → domain ← infrastructure). Chi tiết: `.claude/rules/clean-architecture.md`.

### Luồng phụ thuộc

- **Domain** — types thuần, repository interfaces (không NestJS/TypeORM).
- **Application** — services / use cases, ports cross-module (`Symbol` + `@Inject`).
- **Infrastructure** — TypeORM repo impl, Wispace/Meta HTTP, OpenAI callers.
- **Presentation** — controllers (mỏng, delegate xuống application).

### Ports cross-module

| Token | Dùng khi |
|-------|----------|
| `MESSENGER_REPOSITORY` | Đọc/ghi mapping, logs |
| `MESSENGER_MAPPING_READER` | Study reminder sync / display name |
| `MESSAGE_SENDER` | Gửi tin Messenger (dispatch, không import `MessengerService`) |

`StudyReminderModule` import `MessengerOutboundModule` — **không** `forwardRef` với `MessengerModule`.

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
    │   └── messenger-outbound.module.ts   # Send API + mapping (tách cycle)
    ├── chat-rate-limit/    # quota ngày + idempotency (H2–H7)
    ├── student-report/
    ├── study-reminder/
    └── scheduler/           # cron + ops HTTP /messenger/*
docs/                        # Tài liệu chi tiết — đọc theo task
scripts/                     # CLI debug (không chạy trong app runtime)
```

Mỗi feature trong `modules/<name>/`:

```
domain/entities|repositories/ → application/services|ports/ → infrastructure/ → presentation/controllers/
```

### Module → trách nhiệm

| Module | Vai trò |
|--------|---------|
| `ChatRateLimitModule` | Quota FREE_FORM: reserve/refund/burst, hard cap H3, ops recover H2 |
| `MessengerModule` | Webhook, profile menu, chat queue + agent, shared queue H7 |
| `MessengerOutboundModule` | Send API, `MessengerRepository`, ports |
| `StudentReportModule` | Wispace goals/scores → LLM báo cáo |
| `StudyReminderModule` | Sync/dispatch/cleanup jobs, LLM nhắc học |
| `SchedulerModule` | `ReportCronService` + HTTP ops endpoints |
| `DatabaseModule` | TypeORM + PostgreSQL |

`AppModule` import trực tiếp `StudyReminderModule` (không chỉ transitive).

---

## Code style & conventions

- **Ngôn ngữ:** TypeScript, NestJS 11, TypeORM.
- **Tin nhắn user-facing:** tiếng Việt.
- **Log / comment:** tiếng Anh hoặc Việt ngắn — chỉ khi logic không hiển nhiên.
- **Config:** `ConfigService` + `.env`; thêm biến mới → cập nhật `.env.example`.
- **Migration:** `src/infrastructure/database/migrations/`, entity trong `src/infrastructure/database/entities/`.
- **Prompts:** `src/shared/prompts/` — không inline system prompt dài trong service.
- **Cross-module:** inject port (`@Inject(TOKEN)`), `import type` cho interface.

### Anti-patterns (tránh)

| Đừng | Thay bằng |
|------|-----------|
| Nhét logic study reminder vào `MessengerService` | `StudyReminderService` / worker |
| `StudyReminderModule` import `MessengerModule` | `MessengerOutboundModule` + ports |
| `@Entity()` trong `domain/` | ORM entity ở `infrastructure/database/entities/` |
| Hardcode lead time nhắc lịch | `StudyReminderScheduleService` + `.env` |
| Thêm Bull/SQS/Redis queue | Bảng `study_reminder_jobs` (outbox POC) |
| Hardcode token/API key | `.env` + `ConfigService` |
| Commit `.env` | Chỉ `.env.example` |

---

## Task → file (routing nhanh)

| Task | File chính |
|------|------------|
| Thêm menu postback | `infrastructure/meta/messenger-profile.service.ts`, `application/services/messenger.service.ts` |
| Đổi nội dung báo cáo AI | `shared/prompts/student-report.system.txt`, `student-report/.../student-report.service.ts` |
| Đổi nội dung nhắc học | `shared/prompts/study-reminder.system.txt`, `study-reminder/.../study-reminder.service.ts` |
| Đổi lead time / horizon / retention | `.env`, `study-reminder-schedule.service.ts` |
| Thêm migration bảng | `infrastructure/database/migrations/`, `entities/` |
| Wispace đổi lịch → sync | `scheduler/.../scheduler.controller.ts` → `StudyReminderSyncService` |
| UserCalendar API client | `study-reminder/infrastructure/wispace/user-calendar-api.service.ts` |
| Gửi tin từ module khác | Inject `MESSAGE_SENDER`, không `MessengerService` |
| Sync toàn bộ (ops) | `POST /messenger/sync-study-reminders`, `scripts/sync-study-reminder-jobs.mjs` |
| Rate limit chat | `ChatRateLimitService`, `MessengerChatQueueService`, [chat-rate-limit-quota.md](docs/chat-rate-limit-quota.md) |
| Shared queue multi-pod (H7/R4) | `CHAT_QUEUE_STORE` / `CHAT_QUEUE_SHARED`, `CHAT_QUEUE_STORE` port, `MessengerChatQueueWorkerService` |
| Ops quota scripts | `scripts/chat-quota-status.mjs`, `chat-quota-recover-stuck.mjs`, `chat-quota-cleanup-idempotency.mjs` |

---

## Data flows (tóm tắt)

### Liên kết user

`ref` query param = `userId` WISPACE → lưu `user_messenger_mappings` (`psid` + `user_id`).

### Báo cáo học tập

```
UserGoalsApiService + TaskScoreAverageApiService
  → StudentReportService (LLM)
  → MessengerService.sendTextViaPsid
```

Trigger: cron 08:00, menu postback, hoặc `POST /messenger/send-reports`.

### Nhắc lịch học

```
Wispace đổi lịch → POST /messenger/study-calendar/sync { userId }
  → StudyReminderSyncService (GET UserCalendar, x-psid)
  → study_reminder_jobs
  → StudyReminderDispatchService (adaptive poll S2)
  → StudyReminderService (LLM) + MESSAGE_SENDER (MessengerOutbound)
```

### Chat tự do (FREE_FORM)

```
Webhook text → dedupe mid (`CHAT_DEDUPE_STORE` memory/postgres/redis)
  → MessengerChatQueueService.enqueue → debounce flush
  → ChatRateLimitService.reserve (DB idempotency + daily usage, hard cap H3)
  → MessengerAgentService (LLM) → Send API
  → markCompleted; lỗi trước bubble → refund (H4)
```

Postback menu và tin proactive **không** qua `ChatRateLimitService`. Enforcement: `CHAT_RATE_LIMIT_ENABLED=true`.

Wispace **phải** gọi sync API sau POST/DELETE `/api/UserCalendar`. Cron 30 phút chỉ là dự phòng — không thay webhook/event bus.

---

## Security

- **Không** commit secrets: `.env`, token Meta/OpenAI, `INTERNAL_API_KEY`, DB password.
- Ops endpoints bảo vệ bởi `InternalApiKeyGuard` — không bỏ guard khi thêm endpoint vận hành.
- Wispace API: chỉ header `x-psid`, không lưu/log full access token user.
- Meta webhook: xác thực qua `VERIFY_TOKEN` (GET `/webhook`); POST `/webhook` verify `X-Hub-Signature-256` với `MESSENGER_APP_SECRET` (tắt: `MESSENGER_WEBHOOK_SIGNATURE_VERIFY=false`).

---

## Documentation index (đọc theo task)

| Ưu tiên | File | Khi nào đọc |
|---------|------|-------------|
| 1 | [docs/project-overview.md](docs/project-overview.md) | Lần đầu vào repo — kiến trúc, API, cron |
| 2 | [docs/study-session-reminder.md](docs/study-session-reminder.md) | Sửa nhắc lịch, jobs, sync, dispatch, rollover |
| 3 | [docs/chat-rate-limit-quota.md](docs/chat-rate-limit-quota.md) | Chatbot hai chiều, rate limit, quota |
| 4 | [docs/edge-cases-roadmap.md](docs/edge-cases-roadmap.md) | Gap & phase khắc phục toàn POC (ngoài chat H1–H7) |
| 5 | `.env.example` | Biến môi trường bắt buộc |
| 6 | `src/shared/config/poc.constants.ts` | Link `m.me`, parse `userId` từ `ref` |
| — | `.claude/rules/clean-architecture.md` | Sửa/thêm code trong `src/modules/` |
| — | `.claude/rules/chat-rate-limit.md` | Sửa `src/modules/chat-rate-limit/**` |
| — | `.claude/rules/messenger-chat.md` | Sửa chat queue/history/worker |

### Claude Code (`.claude/`)

| Path | Mục đích |
|------|----------|
| `CLAUDE.md` | Context load mỗi session |
| `.claude/settings.json` | Permissions (npm/git allow; `.env` deny) |
| `.claude/rules/` | `project-conventions`, `clean-architecture`, `chat-rate-limit`, `messenger-chat`, `study-reminder`, `database`, `prompts` |
| `.claude/skills/` | `/study-reminder-debug`, `/typeorm-migration`, `/edit-llm-prompt`, `/verify` |

Cursor dùng `AGENTS.md` + `.cursor/rules/` (rule `change-workflow`) + skills global `~/.cursor/skills-cursor/` + `.claude/skills/`.

---

## Integration gaps (đừng giả định đã xong)

| Gap | Trạng thái POC |
|-----|----------------|
| `POST /messenger/study-calendar/sync` | ✓ Endpoint + sync theo `userId` |
| Auth ops (`INTERNAL_API_KEY`) | ✓ Header `X-Internal-Api-Key` hoặc Bearer |
| Wispace wire sync sau đổi lịch | ✓ Gọi `POST /messenger/study-calendar/sync` + `X-Internal-Api-Key` |
| Tên học viên cho LLM | ✓ Bảng `users` + view `"Users"` trên `ai_chat_bot_db` (`DisplayName` → `'Chào bạn nha'`) |
| DB POC tách khỏi `writing_ai_hub_db` | ✓ `ai_chat_bot_db` + scripts migrate/drop trên hub cũ |
| Upsert job đã `sent` khi đổi giờ cùng `session_key` | ✓ `StudyReminderJobRepository.upsertPendingJob` reopen → `pending` |
| Mapping đổi `user_id` cùng PSID (L3) | ✓ `MessengerMappingService`, `POST /messenger/mapping/relink`, `npm run messenger:relink` |
| Multi-pod cron báo cáo 08:00 (R4) | ✓ Claim table + advisory lock + `CRON_LEADER_ENABLED` |
| Chat hai chiều + rate limit V1 | ✓ Reserve/refund/burst/whitelist/hint |
| Rate limit hardening H1–H7 | ✓ H2–H7 code; H1 = bật `CHAT_RATE_LIMIT_ENABLED` trên env prod |
| Tier / event store (Phase 7–8) | ✗ Optional — [§5.8](docs/chat-rate-limit-quota.md) |
| Gap toàn dự án (link, báo cáo, nhắc, ops) | Roadmap — [edge-cases-roadmap.md](docs/edge-cases-roadmap.md) |

Khi đóng gap: cập nhật `docs/study-session-reminder.md` và bảng trên.

---

## Boundaries — không làm trừ khi user yêu cầu

- Commit / push git
- Tạo file markdown ngoài `docs/` hoặc sửa README dài dòng không cần thiết
- Thêm message queue (Bull, SQS, Redis)
- Force push, sửa git config

---

## PR / commit guidelines

- Chỉ commit khi user yêu cầu rõ ràng.
- Không commit `.env` hoặc file chứa secrets.
- Message commit: ngắn, mô tả **why** hơn **what**.
- Trước PR: `npm run lint`, `npm run test`, `npm run build` pass (CI); local khuyến nghị `npm run verify`.

# AGENTS.md

Hướng dẫn cho AI coding agents làm việc trong repo **demo_send_message_fb** — POC NestJS gửi tin Facebook Messenger cho học viên WISPACE (báo cáo AI + nhắc lịch học).

Đọc file này trước khi sửa code. Chi tiết sâu nằm trong `docs/` — chỉ đọc khi task liên quan.

---

## Project overview

| | |
|---|---|
| **Stack** | NestJS 11, TypeScript, TypeORM, PostgreSQL, OpenAI |
| **Mục tiêu** | Học viên IELTS liên kết `m.me` ↔ WISPACE, nhận báo cáo tiến độ và nhắc buổi học qua Messenger |
| **Phạm vi** | Backend service nhỏ — **không** full-stack, **không** microservice riêng |
| **DB** | PostgreSQL **dùng chung** với Wispace; POC chỉ migration bảng mapping/logs/jobs |
| **Nguyên tắc** | Diff nhỏ, tái dùng module hiện có, config qua `.env`, không over-engineer (không Redis/queue trừ khi user yêu cầu) |

---

## Dev environment tips

- Copy `.env.example` → `.env` và điền token thật trước khi chạy sync/cron.
- Webhook Meta cần URL public (ngrok/tunnel) trỏ tới `POST /webhook`.
- Sau lần deploy đầu: gọi `POST /messenger/profile/setup` (header `X-Internal-Api-Key`) để cấu hình menu bot.
- Sửa file trong `src/prompts/*.system.txt` → **bắt buộc** `npm run build` (Nest copy assets sang `dist/prompts/`).
- Study reminder: biến `STUDY_REMINDER_*` **bắt buộc** — dùng `readRequiredPositiveNumber`, không hardcode fallback trong code.
- Wispace API auth bằng header **`x-psid`** (PSID Messenger), không dùng user access token.
- Ops HTTP (`/messenger/study-calendar/sync`, `send-reports`, …) cần header **`X-Internal-Api-Key`** hoặc `Authorization: Bearer …` khớp `INTERNAL_API_KEY`.
- Cron nội bộ (sync 30 phút, dispatch 1 phút) chạy trong process — không qua API key.
- Debug jobs nhắc lịch: `npm run study-reminder:jobs`.
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
npm run format             # prettier
```

### Scripts tiện ích (cần `.env` + DB)

```bash
npm run db:inspect
npm run db:explore-study-schedule
npm run study-reminder:sync-only    # sync jobs, không migrate
npm run study-reminder:sync         # build + migrate + sync + dispatch
npm run study-reminder:jobs         # in jobs trong DB
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
- Sửa guard ops API → `internal-api-key.guard.spec.ts`
- Sửa parse `ref`/link `m.me` → `poc.constants.spec.ts`

Trước khi kết thúc task: chạy `npm run build` và `npm run test`. Sửa lỗi type/lint/test cho đến khi pass.

Spec hiện có:

- `src/study-reminder/study-reminder-schedule.service.spec.ts`
- `src/study-reminder/study-reminder-cleanup.service.spec.ts`
- `src/common/guards/internal-api-key.guard.spec.ts`
- `src/config/poc.constants.spec.ts`
- `src/app.controller.spec.ts`

---

## Project structure

```
src/
├── messenger/           # Webhook, Send API, menu, mapping repository
├── student-report/      # Báo cáo học tập — Wispace API + OpenAI
├── study-reminder/      # Outbox jobs, UserCalendar API, sync/dispatch/cleanup, LLM
├── scheduler/           # Cron báo cáo thi; HTTP trigger study reminder
├── database/            # Entities, migrations TypeORM
├── prompts/             # System prompt OpenAI (*.system.txt)
├── config/              # Hằng POC (m.me link, parse userId từ ref)
└── common/              # Guards (InternalApiKeyGuard), shared module
docs/                    # Tài liệu chi tiết — đọc theo task
scripts/                 # CLI debug (không chạy trong app runtime)
```

### Module → trách nhiệm

| Module | Vai trò |
|--------|---------|
| `MessengerModule` | Webhook, gửi tin, profile menu, mapping/logs |
| `StudentReportModule` | API Wispace goals/scores → LLM báo cáo |
| `StudyReminderModule` | Sync lịch, dispatch job, cleanup, LLM nhắc học |
| `SchedulerModule` | `ReportCronService` + HTTP ops endpoints |
| `DatabaseModule` | TypeORM + PostgreSQL, auto migration khi start |

`StudyReminderModule` import qua `MessengerModule` (forwardRef) và `SchedulerModule`.

---

## Code style & conventions

- **Ngôn ngữ:** TypeScript, NestJS 11, TypeORM.
- **Tin nhắn user-facing:** tiếng Việt.
- **Log / comment:** tiếng Anh hoặc Việt ngắn — chỉ khi logic không hiển nhiên.
- **Config:** `ConfigService` + `.env`; thêm biến mới → cập nhật `.env.example`.
- **Migration:** tạo file trong `src/database/migrations/`, entity trong `src/database/entities/`.
- **Prompts:** không inline system prompt dài trong service — dùng `src/prompts/`.

### Anti-patterns (tránh)

| Đừng | Thay bằng |
|------|-----------|
| Nhét logic study reminder vào `MessengerService` | `StudyReminderService` / worker |
| Hardcode lead time nhắc lịch | `StudyReminderScheduleService` + `.env` |
| Thêm Bull/SQS/Redis queue | Bảng `study_reminder_jobs` (outbox POC) |
| Hardcode token/API key | `.env` + `ConfigService` |
| Commit `.env` | Chỉ `.env.example` |

---

## Task → file (routing nhanh)

| Task | File chính |
|------|------------|
| Thêm menu postback | `messenger-profile.service.ts`, `messenger.service.ts` (`handlePostback`) |
| Đổi nội dung báo cáo AI | `src/prompts/student-report.system.txt`, `student-report.service.ts` |
| Đổi nội dung nhắc học | `src/prompts/study-reminder.system.txt`, `study-reminder.service.ts` |
| Đổi lead time / horizon / retention | `.env`, `study-reminder-schedule.service.ts` |
| Thêm migration bảng | `src/database/migrations/`, `entities/` |
| Wispace đổi lịch → sync | `scheduler.controller.ts` → `StudyReminderSyncService.syncUpcomingSessions({ userId })` |
| UserCalendar API client | `user-calendar-api.service.ts` |
| Sync toàn bộ (ops) | `POST /messenger/sync-study-reminders`, `scripts/sync-study-reminder-jobs.mjs` |
| Rate limit chat (tương lai) | Xem `docs/chat-rate-limit-quota.md` |

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
  → StudyReminderDispatchService (cron 1 phút)
  → StudyReminderService (LLM)
  → Messenger
```

Wispace **phải** gọi sync API sau POST/DELETE `/api/UserCalendar`. Cron 30 phút chỉ là dự phòng — không thay webhook/event bus.

---

## Security

- **Không** commit secrets: `.env`, token Meta/OpenAI, `INTERNAL_API_KEY`, DB password.
- Ops endpoints bảo vệ bởi `InternalApiKeyGuard` — không bỏ guard khi thêm endpoint vận hành.
- Wispace API: chỉ header `x-psid`, không lưu/log full access token user.
- Meta webhook: xác thực qua `VERIFY_TOKEN` (GET `/webhook`).

---

## Documentation index (đọc theo task)

| Ưu tiên | File | Khi nào đọc |
|---------|------|-------------|
| 1 | [docs/project-overview.md](docs/project-overview.md) | Lần đầu vào repo — kiến trúc, API, cron |
| 2 | [docs/study-session-reminder.md](docs/study-session-reminder.md) | Sửa nhắc lịch, jobs, sync, dispatch, rollover |
| 3 | [docs/chat-rate-limit-quota.md](docs/chat-rate-limit-quota.md) | Chatbot hai chiều, rate limit, quota |
| 4 | `.env.example` | Biến môi trường bắt buộc |
| 5 | `src/config/poc.constants.ts` | Link `m.me`, parse `userId` từ `ref` |

### Claude Code (`.claude/`)

| Path | Mục đích |
|------|----------|
| `CLAUDE.md` | Context load mỗi session |
| `.claude/settings.json` | Permissions (npm/git allow; `.env` deny) |
| `.claude/rules/` | Conventions modular, path-scoped |
| `.claude/skills/` | `/study-reminder-debug`, `/typeorm-migration`, `/edit-llm-prompt`, `/verify` |

Cursor dùng file này (`AGENTS.md`) + skills global `~/.cursor/skills-cursor/`. Repo **không** có `.cursor/rules/` riêng.

---

## Integration gaps (đừng giả định đã xong)

| Gap | Trạng thái POC |
|-----|----------------|
| `POST /messenger/study-calendar/sync` | ✓ Endpoint + sync theo `userId` |
| Auth ops (`INTERNAL_API_KEY`) | ✓ Header `X-Internal-Api-Key` hoặc Bearer |
| Wispace wire sync sau đổi lịch | ✗ Cần cấu hình key + gọi API từ Wispace |
| Tên học viên cho LLM | ✓ `Users.DisplayName` → `Username` → `'bạn'` |
| Upsert job đã `sent` khi đổi giờ cùng `session_key` | ✗ Cần cleanup job cũ hoặc sửa upsert |
| Chat hai chiều + rate limit | ✗ Chỉ có tài liệu thiết kế |

Khi đóng gap: cập nhật `docs/study-session-reminder.md` và bảng trên.

---

## Boundaries — không làm trừ khi user yêu cầu

- Commit / push git
- Tạo file markdown ngoài `docs/` hoặc sửa README dài dòng không cần thiết
- Thêm message queue (Bull, SQS, Redis)
- Force push, sửa git config
- Tự tạo `.cursor/rules` (đề xuất user dùng skill create-rule nếu cần rule lâu dài)

---

## PR / commit guidelines

- Chỉ commit khi user yêu cầu rõ ràng.
- Không commit `.env` hoặc file chứa secrets.
- Message commit: ngắn, mô tả **why** hơn **what**.
- Trước PR: `npm run build`, `npm run test`, `npm run lint` pass.

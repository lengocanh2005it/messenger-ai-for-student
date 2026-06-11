# Hướng dẫn cho AI Agent (Cursor)

Tài liệu này giúp agent làm việc đúng ngữ cảnh repo **demo_send_message_fb** — POC NestJS gửi tin Messenger cho WISPACE. Đọc trước khi sửa code hoặc thêm tính năng.

---

## 1. Đọc gì trước

| Ưu tiên | File | Khi nào |
|---------|------|---------|
| 1 | [docs/project-overview.md](docs/project-overview.md) | Lần đầu vào repo — kiến trúc, module, API |
| 2 | [docs/study-session-reminder.md](docs/study-session-reminder.md) | Sửa nhắc lịch học, jobs, sync, dispatch |
| 3 | `.env.example` | Biến môi trường bắt buộc |
| 4 | `src/config/poc.constants.ts` | Link `m.me`, parse `userId` từ `ref` |

Repo **không** có `.cursor/rules/` hay project skills riêng — quy ước nằm ở file này và `docs/`.

---

## 2. Bối cảnh sản phẩm

- **Mục tiêu POC:** chứng minh học viên IELTS nhận **báo cáo AI** và **nhắc lịch học** qua Messenger sau khi liên kết tài khoản WISPACE.
- **Không phải** app full-stack — service backend nhỏ, DB PostgreSQL **dùng chung** với Wispace.
- **Ưu tiên:** diff nhỏ, tái dùng module hiện có, config qua `.env`, không over-engineer (không thêm Redis/queue trừ khi được yêu cầu).

---

## 3. Cấu trúc module — chỗ nào sửa gì

```
src/messenger/          → Webhook, gửi tin Meta, menu, mapping repository
src/student-report/     → Báo cáo học tập, gọi WISPACE API + OpenAI
src/study-reminder/     → Outbox jobs, UserCalendar API, sync/dispatch/cleanup, LLM
src/scheduler/          → Cron báo cáo thi; POST study-calendar/sync, sync-study-reminders
src/database/           → Entities, migrations TypeORM
src/prompts/            → System prompt OpenAI (*.system.txt) — sửa prompt ở đây
src/config/             → Hằng POC (link, message cố định ngắn)
```

**Tránh:**

- Nhét logic study reminder vào `MessengerService` — dùng `StudyReminderService` / worker.
- Hardcode thời gian nhắc lịch — dùng `StudyReminderScheduleService` + `.env`.
- Inline system prompt dài trong service — thêm/sửa file trong `src/prompts/`.

---

## 4. Quy ước code

- **Ngôn ngữ:** TypeScript, NestJS 11, TypeORM.
- **Tin nhắn user-facing:** tiếng Việt.
- **Log / comment:** tiếng Anh hoặc Việt ngắn, chỉ khi logic không hiển nhiên.
- **Config:** `ConfigService` + `.env`; study reminder dùng `readRequiredPositiveNumber` — không fallback số trong code.
- **Ops HTTP** (`/messenger/study-calendar/sync`, send-reports, …): header `X-Internal-Api-Key: ${INTERNAL_API_KEY}`.
- **Wispace API:** header `x-psid` (PSID Messenger), không dùng user access token.
- **Migration:** tạo file trong `src/database/migrations/`, chạy `npm run migration:run`.
- **Prompts:** sau sửa `.txt` cần `npm run build` (assets copy sang `dist/prompts/`).

---

## 5. Luồng dữ liệu quan trọng

### Liên kết user

`ref` query param = `userId` WISPACE → `user_messenger_mappings.psid` + `user_id`.

### Báo cáo học tập

`UserGoalsApiService` + `TaskScoreAverageApiService` → `StudentReportService` → `MessengerService.sendTextViaPsid`.

### Nhắc lịch học

```
Wispace đổi lịch → POST /messenger/study-calendar/sync { userId }
  → StudyReminderSyncService (GET UserCalendar x-psid) → study_reminder_jobs
  → StudyReminderDispatchService (cron 1 phút) → StudyReminderService (LLM) → Messenger
```

Wispace **phải** gọi sync API sau POST/DELETE `/api/UserCalendar` — xem `docs/study-session-reminder.md` §3.6. Không dùng webhook/event bus.

---

## 6. Task thường gặp → file

| Task | File chính |
|------|------------|
| Thêm menu postback | `messenger-profile.service.ts`, `messenger.service.ts` (handlePostback) |
| Đổi nội dung báo cáo AI | `src/prompts/student-report.system.txt`, `student-report.service.ts` |
| Đổi nội dung nhắc học | `src/prompts/study-reminder.system.txt`, `study-reminder.service.ts` |
| Đổi lead time / horizon / retention | `.env`, `study-reminder-schedule.service.ts` |
| Thêm migration bảng | `src/database/migrations/`, entity trong `entities/` |
| Wispace đổi lịch → sync | `scheduler.controller.ts` → `StudyReminderSyncService.syncUpcomingSessions({ userId })` |
| UserCalendar API client | `user-calendar-api.service.ts` (GET/POST/DELETE, x-psid) |
| Sync toàn bộ (ops) | `POST /messenger/sync-study-reminders`, `scripts/sync-study-reminder-jobs.mjs` |
| Debug jobs | `npm run study-reminder:jobs`, `study-reminder-job.repository.ts` |

---

## 7. Test & build

```bash
npm run build
npm run test                    # jest, spec trong src/
npm run study-reminder:sync-only  # cần .env + DB
```

Spec hiện có: `study-reminder-schedule.service.spec.ts`. Thêm test khi sửa logic schedule tính `remind_at`.

Không commit `.env` (secrets). Cập nhật `.env.example` khi thêm biến mới.

---

## 8. Không làm trừ khi user yêu cầu

- Commit / push git
- Tạo file markdown ngoài `docs/` hoặc sửa README dài dòng không cần thiết
- Thêm message queue (Bull, SQS) — POC dùng bảng `study_reminder_jobs`
- Force push, sửa git config
- Hardcode token, API key

---

## 9. Gap tích hợp (đừng giả định đã xong)

| Gap | Trạng thái POC |
|-----|----------------|
| `POST /messenger/study-calendar/sync` | ✓ Endpoint + sync theo `userId` |
| Auth ops (`INTERNAL_API_KEY`) | ✓ Header `X-Internal-Api-Key` hoặc Bearer |
| Wispace wire sync sau đổi lịch | ✗ Cần cấu hình `INTERNAL_API_KEY` + gọi API |
| Tên học viên cho LLM | ✓ `Users.DisplayName` → `Username` → `'bạn'` |
| Upsert job đã `sent` khi đổi giờ cùng `session_key` | ✗ Cần cleanup job cũ hoặc sửa upsert |

Khi đóng gap, cập nhật `docs/study-session-reminder.md` và bảng trên.

---

## 10. Skills Cursor (global)

Repo không định nghĩa skill riêng. Agent có thể dùng skills hệ thống Cursor (create-rule, create-skill, review-bugbot…) khi user yêu cầu — không tự tạo `.cursor/rules` trừ khi được nhờ.

Nếu cần rule lâu dài cho repo này, đề xuất user tạo qua skill **create-rule** hoặc file `.cursor/rules/*.mdc`.

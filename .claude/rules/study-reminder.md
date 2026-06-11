---
alwaysApply: false
paths: src/study-reminder/**
---

# Study reminder module

## Luồng

```
POST /messenger/study-calendar/sync { userId }
  → StudyReminderSyncService (GET UserCalendar, x-psid)
  → study_reminder_jobs (pending)
  → StudyReminderDispatchService (cron 1 phút)
  → StudyReminderService (LLM) → Messenger
```

Wispace **phải** gọi sync sau POST/DELETE `UserCalendar`. Cron 30 phút chỉ là dự phòng.

## Config bắt buộc

Biến `STUDY_REMINDER_*` trong `.env` — dùng `readRequiredPositiveNumber`, **không** fallback số trong code.

## File chính

| File | Vai trò |
|------|---------|
| `study-reminder-sync.service.ts` | Sync lịch → jobs |
| `study-reminder-dispatch.service.ts` | Claim + gửi job đến hạn |
| `study-reminder-schedule.service.ts` | Tính `remind_at` |
| `study-reminder-worker.service.ts` | Cron sync/dispatch/rollover |
| `user-calendar-api.service.ts` | GET UserCalendar (x-psid) |
| `study-reminder-job.repository.ts` | CRUD jobs |

## Test

Sửa logic `remind_at` → cập nhật `study-reminder-schedule.service.spec.ts`.

## Debug

```bash
npm run study-reminder:jobs
npm run study-reminder:sync-only
```

## Gap đã biết

Upsert job đã `sent` khi đổi giờ cùng `session_key` — cần cleanup hoặc sửa upsert.

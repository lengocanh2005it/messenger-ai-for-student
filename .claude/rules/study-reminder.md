---
alwaysApply: false
paths: src/modules/study-reminder/**
---

# Study reminder module

## Luồng

```
POST /messenger/study-calendar/sync { userId }
  → StudyReminderSyncService (GET UserCalendar, x-psid)
  → study_reminder_jobs (pending)
  → StudyReminderDispatchService (cron 1 phút)
  → StudyReminderService (LLM) + MESSAGE_SENDER (MessengerOutbound)
```

Wispace **phải** gọi sync sau POST/DELETE `UserCalendar`. Cron 30 phút chỉ là dự phòng.

## Config bắt buộc

Biến `STUDY_REMINDER_*` trong `.env` — dùng `readRequiredPositiveNumber`, **không** fallback số trong code.

## File chính (Clean Architecture)

| File | Tầng | Vai trò |
|------|------|---------|
| `application/services/study-reminder-sync.service.ts` | application | Sync lịch → jobs |
| `application/services/study-reminder-dispatch.service.ts` | application | Claim + gửi (qua `MESSAGE_SENDER`) |
| `application/services/study-reminder-schedule.service.ts` | application | Tính `remind_at` |
| `application/services/study-reminder-worker.service.ts` | application | Cron sync/dispatch/rollover |
| `infrastructure/wispace/user-calendar-api.service.ts` | infrastructure | GET UserCalendar (x-psid) |
| `infrastructure/persistence/study-reminder-job.repository.ts` | infrastructure | CRUD jobs |
| `application/ports/messenger-mapping.port.ts` | application | Đọc mapping — không import `MessengerModule` |

## Test

Sửa logic `remind_at` → `application/services/study-reminder-schedule.service.spec.ts`.

## Debug

```bash
npm run study-reminder:jobs
npm run study-reminder:sync-only
```

## Gap đã biết

Upsert job đã `sent` khi đổi giờ cùng `session_key` — cần cleanup hoặc sửa upsert.

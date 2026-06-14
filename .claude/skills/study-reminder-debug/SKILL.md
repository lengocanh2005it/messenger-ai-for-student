---
name: study-reminder-debug
description: Debug study reminder jobs — sync, dispatch, remind_at, job status. Use when user asks about nhắc lịch học, study_reminder_jobs, sync không chạy, job pending/sent/failed, or Wispace calendar sync.
---

# Debug study reminder

## 1. Đọc context

- `docs/study-session-reminder.md` (luồng sync/dispatch/rollover)
- `.claude/rules/study-reminder.md`

## 2. Kiểm tra jobs trong DB

```bash
npm run study-reminder:jobs
npm run study-reminder:jobs -- --failed
npm run study-reminder:jobs -- --stuck
npm run study-reminder:jobs -- --summary
npm run ops:health
```

Xem: `status`, `remind_at`, `scheduled_at`, `session_key`, `retry_count`.

## 3. Sync thủ công

```bash
npm run study-reminder:sync-only
```

Hoặc ops API (cần `X-Internal-Api-Key`):

```http
POST /messenger/study-calendar/sync
{ "userId": 123 }

POST /messenger/sync-study-reminders
POST /messenger/send-study-reminders
```

## 4. Checklist lỗi thường gặp

- [ ] User có `psid` trong `user_messenger_mappings` (status ACTIVE)?
- [ ] `STUDY_REMINDER_*` đủ trong `.env`?
- [ ] `remind_at` đã qua nhưng `scheduled_at` vẫn trong tương lai?
- [ ] Wispace đã gọi sync sau đổi lịch? (gap tích hợp phổ biến)
- [ ] UserCalendar API trả lịch đúng với `x-psid`?

## 5. Sửa code

- Schedule logic → `study-reminder-schedule.service.ts` + spec
- Sync → `study-reminder-sync.service.ts`
- Dispatch → `study-reminder-dispatch.service.ts`

Sau sửa: `npm run build && npm run test`

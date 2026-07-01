---
alwaysApply: false
paths: apps/messenger-bot/src/infrastructure/database/**
---

# Database & migrations

## Bảng POC (migration trong repo)

- `user_messenger_mappings` — `user_id` ↔ `psid`
- `messenger_message_logs` — audit tin gửi/nhận; cron `messenger-message-log-cleanup` xóa row cũ hơn `MESSENGER_MESSAGE_LOG_RETENTION_DAYS` (default 90) vào 03:00 ICT mỗi thứ Hai hàng tuần
- `messenger_chat_daily_usage` — quota chat FREE_FORM theo ngày
- `messenger_chat_idempotency` — idempotency `message.mid` (reserve/refund)
- `study_reminder_jobs` — outbox nhắc lịch
- `users` + view `"Users"` — cache display name / exam date; chỉ `user_id` có mapping Messenger

**Prod DB:** `ai_chat_bot_db`. Hub cũ `writing_ai_hub_db` — đã drop bảng POC (ops script).

Migration H7 tạo `messenger_chat_queue_buffer` + `messenger_chat_history` — **dropped** bởi `1717747200010-DropMessengerChatQueueBufferAndHistoryTables.ts` (queue/history chuyển Redis hoặc memory).

## Cache user (DB dedicated, migration `1717747200008`)

- `users` — `user_id`, `display_name`, `exam_date` — chỉ user có mapping Messenger (sync từ Wispace `"Users"` khi migrate / link mới).
- View `"Users"` — map PascalCase cho `UserEntity` / `UserDisplayNameService` (read-only).
- Redis R5 (`RedisUserDisplayNameCache`): key `cache:user:display:{userId}` — đọc trước Postgres khi `REDIS_ENABLED=true`.

## Wispace hub (không migration trong repo)

- API HTTP duy nhất cho lịch học (`UserCalendar`, goals, scores) — **I3 ✓** không còn fallback DB `UserCalendars` trong app.
- Bảng `"Users"`, `UserCalendars` trên `writing_ai_hub_db` — Wispace sở hữu; app POC không đọc trực tiếp.

## Thêm migration

1. Sửa/thêm entity trong `apps/messenger-bot/src/infrastructure/database/entities/`.
2. Tạo file migration trong `apps/messenger-bot/src/infrastructure/database/migrations/` (timestamp prefix).
3. Chạy `npm run migration:run` (trong `apps/messenger-bot/`).

CLI generate (nếu cần): `npm run migration:generate -- src/infrastructure/database/migrations/TenMigration` (chạy trong `apps/messenger-bot/`).

DB dùng chung giữa các bot (Messenger nay, Discord/Zalo sau) — khóa `psid` sẽ generalize thành `(platform, external_user_id)` ở Phase 2, xem `docs/turborepo-migration-plan.md`.

## Lưu ý

- `data-source.ts` dùng cho TypeORM CLI (`dist/infrastructure/database/data-source.js`).
- App dùng `typeorm.options.ts` qua `DatabaseModule`.
- `DB_MIGRATIONS_RUN=true` → auto migrate khi start.
- ORM entities **không** đặt trong `modules/*/domain/` — domain chỉ types thuần.

---
alwaysApply: false
paths: apps/messenger-bot/src/infrastructure/database/**
---

# Database & migrations

## Bảng POC (migration trong repo)

- `user_platform_mappings` — `user_id` ↔ `(platform, external_user_id)` (đổi tên từ `user_messenger_mappings` ở Phase 2)
- `message_logs` — audit tin gửi/nhận; cron `messenger-message-log-cleanup` xóa row cũ hơn `MESSENGER_MESSAGE_LOG_RETENTION_DAYS` (default 90) vào 03:00 ICT mỗi thứ Hai hàng tuần
- `chat_daily_usage`, `chat_idempotency` — quota chat FREE_FORM + idempotency reserve/refund (đổi tên từ `messenger_chat_*` ở Phase 2) — entity + core logic sở hữu bởi `packages/chat-metering` (dùng chung `apps/discord-bot`), messenger-bot chỉ còn thin wrapper
- `llm_usage_events`, `llm_safety_events` — token/cost + grounding-warning tracking — cũng sở hữu bởi `packages/chat-metering`
- `study_reminder_jobs` — outbox nhắc lịch
- `users` + view `"Users"` — cache display name / exam date; chỉ `user_id` có mapping Messenger

**Prod DB:** `ai_chat_bot_db`. Hub cũ `writing_ai_hub_db` — đã drop bảng POC (ops script). Tất cả bảng trên đã generalize `(platform, external_user_id)` từ Phase 2 — xem `docs/turborepo-migration-plan.md`.

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

DB dùng chung giữa các bot (Messenger, Discord nay, Zalo sau) — khóa đã generalize thành `(platform, external_user_id)` ở Phase 2, xem `docs/turborepo-migration-plan.md`. Entity của 4 bảng chat-metering (`chat_daily_usage`, `chat_idempotency`, `llm_usage_events`, `llm_safety_events`) sống trong `packages/chat-metering`, **không** thêm entity trùng trong `apps/*/infrastructure/database/entities/` — chỉ migration (do messenger-bot chạy) mới sửa schema các bảng này.

## Lưu ý

- `data-source.ts` dùng cho TypeORM CLI (`dist/infrastructure/database/data-source.js`).
- App dùng `typeorm.options.ts` qua `DatabaseModule`.
- `DB_MIGRATIONS_RUN=true` → auto migrate khi start.
- ORM entities **không** đặt trong `modules/*/domain/` — domain chỉ types thuần.

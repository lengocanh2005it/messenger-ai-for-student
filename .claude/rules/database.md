---
alwaysApply: false
paths: src/infrastructure/database/**
---

# Database & migrations

## Bảng POC (migration trong repo)

- `user_messenger_mappings` — `user_id` ↔ `psid`
- `messenger_message_logs` — audit tin gửi/nhận
- `messenger_chat_daily_usage` — quota chat FREE_FORM theo ngày
- `messenger_chat_idempotency` — idempotency `message.mid`
- `study_reminder_jobs` — outbox nhắc lịch

## Bảng Wispace (đọc only)

- `UserCalendars`, `Users` — không tạo migration trong repo này.

## Thêm migration

1. Sửa/thêm entity trong `src/infrastructure/database/entities/`.
2. Tạo file migration trong `src/infrastructure/database/migrations/` (timestamp prefix).
3. Chạy `npm run migration:run`.

CLI generate (nếu cần): `npm run migration:generate -- src/infrastructure/database/migrations/TenMigration`.

## Lưu ý

- `data-source.ts` dùng cho TypeORM CLI (`dist/infrastructure/database/data-source.js`).
- App dùng `typeorm.options.ts` qua `DatabaseModule`.
- `DB_MIGRATIONS_RUN=true` → auto migrate khi start.
- ORM entities **không** đặt trong `modules/*/domain/` — domain chỉ types thuần.

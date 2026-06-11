---
alwaysApply: false
paths: src/database/**
---

# Database & migrations

## Bảng POC (migration trong repo)

- `user_messenger_mappings` — `user_id` ↔ `psid`
- `messenger_message_logs` — audit tin gửi/nhận
- `study_reminder_jobs` — outbox nhắc lịch

## Bảng Wispace (đọc only)

- `UserCalendars`, `Users` — không tạo migration trong repo này.

## Thêm migration

1. Sửa/thêm entity trong `src/database/entities/`.
2. Tạo file migration trong `src/database/migrations/` (timestamp prefix).
3. Chạy `npm run migration:run`.

CLI generate (nếu cần): `npm run migration:generate -- src/database/migrations/TenMigration`.

## Lưu ý

- `data-source.ts` dùng cho TypeORM CLI; app dùng `typeorm.options.ts`.
- `DB_MIGRATIONS_RUN=true` → auto migrate khi start.

---
name: typeorm-migration
description: Add or modify TypeORM entities and migrations for this NestJS POC. Use when user asks for migration, new table, schema change, entity, or database column.
disable-model-invocation: true
---

# TypeORM migration workflow

## Steps

1. Read `.claude/rules/database.md`.
2. Edit entity in `src/database/entities/`.
3. Create migration in `src/database/migrations/` with timestamp prefix (match existing files).
4. Export entity from `src/database/entities/index.ts` if new.
5. Run:

```bash
npm run migration:run
npm run build
npm run test
```

## Constraints

- Chỉ migration bảng POC: mappings, logs, jobs.
- **Không** migration bảng Wispace (`UserCalendars`, `Users`, …).
- Cập nhật `.env.example` nếu thêm biến môi trường mới (không phải DB column).

## Revert (cẩn thận)

```bash
npm run migration:revert
```

Chỉ khi user yêu cầu rõ — shared DB với Wispace.

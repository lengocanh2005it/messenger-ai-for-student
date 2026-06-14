---
name: verify
description: >-
  Format, lint, typecheck, test, and build this NestJS project before finishing
  a task. Use when completing code changes, before commit, or when user asks
  to verify/check the build.
disable-model-invocation: true
---

# Verify POC

Chạy **sau khi sửa code** và **sau khi cập nhật agent docs/skills** liên quan (xem `AGENTS.md` → *Docs & skills khi đổi code*).

## Prerequisites

```bash
npm ci
```

Bắt buộc nếu `npm run test` báo `'jest' is not recognized` (thường do vừa `npm ci --omit=dev`).

## Quality gate (thứ tự)

```bash
npm run format
npm run verify
```

`npm run verify` = `format:check` + `lint` + `typecheck` + `test` + `build`.

Hoặc từng bước:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## Checks

- Sửa prompt (`src/shared/prompts/*.system.txt`) → sau `build`, kiểm tra `dist/shared/prompts/` có file mới.
- Sửa `remind_at` / schedule → `study-reminder-schedule.service.spec.ts` phải pass.
- **Không** dùng `test:e2e` trong gate mặc định (cần PostgreSQL; e2e đang lỗi thời).

Sửa mọi lỗi format/lint/type/test/build trước khi báo task xong. Không commit trừ khi user yêu cầu.

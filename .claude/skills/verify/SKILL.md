---
name: verify
description: >-
  Format, lint, typecheck, test, and build this Turborepo monorepo before
  finishing a task. Use when completing code changes, before commit, or when
  user asks to verify/check the build.
disable-model-invocation: true
---

# Verify POC (Turborepo)

Chạy **sau khi sửa code** và **sau khi cập nhật agent docs/skills** liên quan (xem `AGENTS.md` → *Docs & skills khi đổi code*).

## Prerequisites

```bash
npm install
```

Chạy ở **root** — npm workspaces resolve cả `apps/*` và `packages/*`. Bắt buộc nếu gặp `'turbo' is not recognized` hoặc thiếu deps sau khi vừa đổi `package.json` của 1 workspace.

## Quality gate

**CI / deploy** (`.github/workflows/deploy.yml`, chỉ chạy cho `apps/messenger-bot`):

```bash
npx turbo run lint --filter=@wispace/messenger-bot...
npx turbo run test --filter=@wispace/messenger-bot...
npx turbo run build --filter=@wispace/messenger-bot...
```

**Local đầy đủ (toàn bộ workspace):**

```bash
npx turbo run format
npx turbo run verify
```

Nếu chỉ sửa `packages/llm-agent`: chạy riêng `npx turbo run test --filter=@wispace/llm-agent` trước (test mock ports, không cần DB/Nest), rồi chạy lại gate của `@wispace/messenger-bot...` (dùng `...` để rebuild dependent app).

`apps/discord-bot` và `apps/zalo-bot` hiện là placeholder (script no-op) — không cần chạy verify riêng cho tới khi có code thật (xem `docs/turborepo-migration-plan.md`).

## Checks

- Sửa prompt Messenger (`apps/messenger-bot/src/shared/prompts/*.system.txt`) → sau `build`, kiểm tra `apps/messenger-bot/dist/shared/prompts/` có file mới.
- Sửa `remind_at` / schedule → `study-reminder-schedule.service.spec.ts` phải pass.
- Sửa `packages/llm-agent` → `agent.service.spec.ts` (trong package) phải pass, và app `@wispace/messenger-bot` build/test lại thành công (dependency).
- **Không** dùng `test:e2e` trong gate mặc định (cần PostgreSQL; e2e đang lỗi thời).

Sửa mọi lỗi format/lint/type/test/build trước khi báo task xong. Không commit trừ khi user yêu cầu.

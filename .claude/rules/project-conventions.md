# Quy ước chung — wispace-bots (Turborepo monorepo)

Turborepo monorepo: `apps/messenger-bot` (NestJS, đầy đủ tính năng) + `apps/discord-bot`/`apps/zalo-bot` (placeholder) + `packages/llm-agent` (LLM function-calling dùng chung). Messenger webhook + báo cáo AI + nhắc lịch học + **chat AI có rate limit** cho WISPACE.

**Đọc thêm:** `.claude/rules/clean-architecture.md` — bắt buộc khi thêm/sửa code trong `apps/*/src/modules/` hoặc `packages/llm-agent/`.

## Nguyên tắc

- Diff nhỏ; đúng tầng Clean Architecture (domain / application / infrastructure / presentation) trong từng app.
- Config qua `.env` + `ConfigService` — không hardcode token/số thời gian.
- Tin nhắn user-facing: **tiếng Việt**. Log/comment: EN hoặc Việt ngắn.
- Không thêm Redis/Bull/SQS trừ khi user yêu cầu — outbox = `study_reminder_jobs`; chat shared queue = PostgreSQL (H7).
- `packages/llm-agent` không phụ thuộc NestJS — chỉ port interface + `openai`. Business logic (Wispace API, DB) ở lại app.

## Ranh giới module (trong `apps/messenger-bot`)

| Module | Chỉ làm |
|--------|---------|
| `modules/messenger/` | Webhook, Send API (outbound), menu, chat queue/agent (adapter dùng `@wispace/llm-agent`), mapping/logs |
| `modules/chat-rate-limit/` | Quota FREE_FORM: reserve/refund/burst, idempotency DB |
| `modules/student-report/` | Báo cáo học tập, Wispace API goals/scores |
| `modules/study-reminder/` | Sync/dispatch/cleanup jobs, UserCalendar API |
| `modules/scheduler/` | Cron báo cáo thi + HTTP ops trigger |

**Không** nhét logic study reminder vào `MessengerService`. **Không** reserve quota trong webhook — chỉ tại `MessengerChatQueueService` flush.

## Auth & API

- Wispace API: headers `x-psid` (PSID Messenger) + `X-Internal-Key` (`WISPACE_INTERNAL_KEY`).
- Ops HTTP: `X-Internal-Api-Key` hoặc `Authorization: Bearer` = `INTERNAL_API_KEY`.
- Không commit `.env`.

## Tài liệu

- Kiến trúc: `.claude/rules/clean-architecture.md`
- Lộ trình monorepo (Discord/Zalo, DB đa nền tảng, CI/CD độc lập): `docs/turborepo-migration-plan.md`
- Tổng quan Messenger bot: `apps/messenger-bot/docs/project-overview.md`
- Rate limit chat: `apps/messenger-bot/docs/chat-rate-limit-quota.md` — rule: `.claude/rules/chat-rate-limit.md`
- Nhắc lịch học: `apps/messenger-bot/docs/study-session-reminder.md`
- Agent chung: `AGENTS.md`

## Khi sửa code (bắt buộc)

1. **Cập nhật tài liệu agent** nếu hành vi/API/env/runbook đổi — xem bảng trong `AGENTS.md` mục *Docs & skills khi đổi code*.
2. **Cập nhật skill** trong `.claude/skills/` nếu workflow debug/verify/migration/prompt bị ảnh hưởng.
3. **Chạy quality gate** trước khi báo xong task (cần `npm install` ở root đầy đủ dev deps):

**CI / deploy** (khớp `.github/workflows/deploy.yml`, chạy cho `apps/messenger-bot`):

```bash
npx turbo run lint --filter=@wispace/messenger-bot...
npx turbo run test --filter=@wispace/messenger-bot...
npx turbo run build --filter=@wispace/messenger-bot...
```

**Local đầy đủ** (toàn bộ workspace, thêm format + typecheck):

```bash
npx turbo run format
npx turbo run verify          # format:check + lint + typecheck + test + build, mọi app/package
```

**Lưu ý:** test = Jest unit spec (`**/*.spec.ts` trong từng app/package). Fail `'jest' is not recognized` hoặc `'turbo' is not recognized` → chạy lại `npm install` ở root (không dùng `npm ci --omit=dev` trước khi test).

## Ops nhanh (chat quota, chạy trong `apps/messenger-bot/`)

```bash
npm run chat-quota:status
npm run chat-quota:recover-stuck
npm run chat-quota:cleanup
```

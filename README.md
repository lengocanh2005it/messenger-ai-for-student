# wispace-bots

Turborepo monorepo — bot học viên WISPACE trên nhiều nền tảng nhắn tin. Hiện có **Facebook Messenger** (đầy đủ tính năng), **Discord** và **Zalo** (placeholder, chưa triển khai), dùng chung 1 package function-calling LLM.

## Cấu trúc

```
apps/messenger-bot/    NestJS — báo cáo AI, nhắc lịch học, chat AI rate limit qua Messenger (đầy đủ tính năng)
apps/discord-bot/      Placeholder — chưa triển khai (xem docs/turborepo-migration-plan.md Phase 3)
apps/zalo-bot/         Placeholder — chưa triển khai (xem docs/turborepo-migration-plan.md Phase 4)
packages/llm-agent/    Orchestration OpenAI function-calling dùng chung mọi bot (framework-agnostic)
```

## Tính năng (Messenger bot)

- Liên kết học viên WISPACE với Messenger (`m.me` + webhook)
- Báo cáo tiến độ AI trước ngày thi (cron + menu)
- Nhắc buổi học sắp tới (outbox jobs + LLM + cron)
- Chat tự do có **rate limit** (quota ngày, burst, H1–H7 hardening)
- Wispace gọi `POST /messenger/study-calendar/sync` sau khi đổi lịch `UserCalendar`

## Tài liệu

| File | Mô tả |
|------|--------|
| [docs/turborepo-migration-plan.md](docs/turborepo-migration-plan.md) | Lộ trình monorepo: Discord/Zalo bot, DB đa nền tảng, CI/CD độc lập |
| [apps/messenger-bot/docs/project-overview.md](apps/messenger-bot/docs/project-overview.md) | Kiến trúc, cấu trúc code, DB, API, cron, runbook quota |
| [apps/messenger-bot/docs/chat-rate-limit-quota.md](apps/messenger-bot/docs/chat-rate-limit-quota.md) | Rate limit chat V1 + H1–H7 |
| [apps/messenger-bot/docs/edge-cases-roadmap.md](apps/messenger-bot/docs/edge-cases-roadmap.md) | Gap toàn POC + checklist QA + phase khắc phục |
| [apps/messenger-bot/docs/study-session-reminder.md](apps/messenger-bot/docs/study-session-reminder.md) | Nhắc lịch học (chi tiết) |
| [apps/messenger-bot/docs/README.md](apps/messenger-bot/docs/README.md) | Mục lục tài liệu Messenger bot |
| [AGENTS.md](AGENTS.md) | Hướng dẫn cho AI agent / Cursor |

## Chạy nhanh (Messenger bot)

```bash
npm install                          # ở root — npm workspaces resolve apps/* + packages/*
cp apps/messenger-bot/.env.example apps/messenger-bot/.env   # điền PAGE_ACCESS_TOKEN, DB, OPENAI_API_KEY, ...
npx turbo run build --filter=@wispace/messenger-bot...
cd apps/messenger-bot
npm run migration:run
npm run start:dev
```

Webhook Meta: `GET/POST /webhook`
Cấu hình menu bot: `POST /messenger/profile/setup`
Wispace sync lịch: `POST /messenger/study-calendar/sync` + header `X-Internal-Api-Key` (xem `apps/messenger-bot/.env` `INTERNAL_API_KEY`)

## Scripts hữu ích (chạy trong `apps/messenger-bot/`)

```bash
npm run study-reminder:sync      # Bootstrap + sync jobs nhắc lịch
npm run study-reminder:jobs      # Xem study_reminder_jobs (--failed, --stuck)
npm run ops:health               # I1+S1 ops snapshot
npm run chat-quota:status        # Tra quota chat (--ops = fleet summary)
npm run chat-quota:recover-stuck # H2: refund stuck reserved
npm run chat-quota:cleanup       # H6: cleanup idempotency cũ
npm run db:inspect
```

## Verify toàn monorepo

```bash
npx turbo run format:check lint typecheck test build
```

## Stack

Turborepo + npm workspaces · NestJS 11 · TypeORM · PostgreSQL (dùng chung giữa các bot) · OpenAI · Facebook Graph API

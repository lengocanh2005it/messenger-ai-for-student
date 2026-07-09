# wispace-bots

Turborepo monorepo — WISPACE student bots across multiple messaging platforms. Currently includes **Facebook Messenger** (fully featured), **Discord**, and **Zalo** (placeholder, not yet implemented), sharing a single function-calling LLM package.

## Structure

```
apps/messenger-bot/    NestJS — AI reports, study reminders, chat AI with rate limit via Messenger (fully featured)
apps/discord-bot/      Placeholder — not yet implemented (see docs/turborepo-migration-plan.md Phase 3)
apps/zalo-bot/         Placeholder — not yet implemented (see docs/turborepo-migration-plan.md Phase 4)
packages/llm-agent/    OpenAI function-calling orchestration shared across all bots (framework-agnostic)
```

## Features (Messenger bot)

- Link WISPACE students with Messenger (`m.me` + webhook)
- AI progress reports before exam day (cron + menu)
- Upcoming study session reminders (outbox jobs + LLM + cron)
- Free-form chat with **rate limit** (daily quota, burst, H1–H7 hardening)
- Wispace calls `POST /messenger/study-calendar/sync` after updating `UserCalendar` schedule

## Documentation

| File | Description |
|------|-------------|
| [docs/turborepo-migration-plan.md](docs/turborepo-migration-plan.md) | Monorepo roadmap: Discord/Zalo bots, multi-platform DB, independent CI/CD |
| [apps/messenger-bot/docs/project-overview.md](apps/messenger-bot/docs/project-overview.md) | Architecture, code structure, DB, API, cron, quota runbook |
| [apps/messenger-bot/docs/chat-rate-limit-quota.md](apps/messenger-bot/docs/chat-rate-limit-quota.md) | Chat rate limit V1 + H1–H7 |
| [apps/messenger-bot/docs/edge-cases-roadmap.md](apps/messenger-bot/docs/edge-cases-roadmap.md) | Full POC gaps + QA checklist + remediation phases |
| [apps/messenger-bot/docs/study-session-reminder.md](apps/messenger-bot/docs/study-session-reminder.md) | Study session reminders (detailed) |
| [apps/messenger-bot/docs/README.md](apps/messenger-bot/docs/README.md) | Messenger bot documentation index |
| [CONTEXT.md](CONTEXT.md) | Domain glossary — project terminology (17 areas, 130+ terms) |
| [docs/adr/](docs/adr/) | Architectural Decision Records — 5 key architecture decisions |
| [docs/agents/](docs/agents/) | Agent skills config: issue tracker, triage labels, domain docs |
| [AGENTS.md](AGENTS.md) | Guidelines for AI agents / Cursor |

## Quick Start (Messenger bot)

```bash
npm install                          # at root — npm workspaces resolve apps/* + packages/*
cp apps/messenger-bot/.env.example apps/messenger-bot/.env   # fill in PAGE_ACCESS_TOKEN, DB, OPENAI_API_KEY, ...
npx turbo run build --filter=@wispace/messenger-bot...
cd apps/messenger-bot
npm run migration:run
npm run start:dev
```

Meta webhook: `GET/POST /webhook`
Bot menu setup: `POST /messenger/profile/setup`
Wispace schedule sync: `POST /messenger/study-calendar/sync` + header `X-Internal-Api-Key` (see `apps/messenger-bot/.env` `INTERNAL_API_KEY`)

## Useful scripts (run in `apps/messenger-bot/`)

```bash
npm run study-reminder:sync      # Bootstrap + sync study reminder jobs
npm run study-reminder:jobs      # View study_reminder_jobs (--failed, --stuck)
npm run ops:health               # I1+S1 ops snapshot
npm run chat-quota:status        # Check chat quota (--ops = fleet summary)
npm run chat-quota:recover-stuck # H2: refund stuck reserved
npm run chat-quota:cleanup       # H6: cleanup old idempotency records
npm run db:inspect
```

## Verify full monorepo

```bash
npx turbo run format:check lint typecheck test build
```

## Stack

Turborepo + npm workspaces · NestJS 11 · TypeORM · PostgreSQL (shared across bots) · OpenAI · Facebook Graph API

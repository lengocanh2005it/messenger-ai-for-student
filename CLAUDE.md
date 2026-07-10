# wispace-bots (Turborepo monorepo)

POC NestJS — bot học viên WISPACE (Messenger nay, Discord/Zalo sắp tới): báo cáo AI + nhắc lịch học + chat AI có rate limit. Turborepo monorepo — xem `docs/turborepo-migration-plan.md` cho lộ trình đầy đủ.

## Cấu trúc

```
apps/messenger-bot/    @wispace/messenger-bot — NestJS app hiện tại (đầy đủ tính năng)
apps/discord-bot/      @wispace/discord-bot — placeholder, chưa triển khai (Phase 3)
apps/zalo-bot/         @wispace/zalo-bot — placeholder, chưa triển khai (Phase 4)
packages/llm-agent/    @wispace/llm-agent — orchestration LLM function-calling dùng chung, framework-agnostic
```

## Stack

NestJS 11 · TypeScript · TypeORM · PostgreSQL (`ai_chat_bot_db`, dùng chung giữa các bot) · Redis (optional R0–R4) · LLM Provider Abstraction (adapter pattern) · Meta Graph API · Turborepo + npm workspaces

## Lệnh thường dùng

Từ root (chạy qua Turborepo, filter theo app khi cần):

```bash
npx turbo run build
npx turbo run test --filter=@wispace/messenger-bot...
npm install --workspace=apps/messenger-bot <pkg>
```

Từ `apps/messenger-bot/` (giống lệnh cũ trước migration):

```bash
npm run start:dev
npm run build
npm run test
npm run migration:run
npm run study-reminder:jobs
npm run chat-quota:status
```

## Tài liệu đầy đủ

- **[AGENTS.md](./AGENTS.md)** — chuẩn cross-agent (Codex, Cursor, Claude)
- `docs/turborepo-migration-plan.md` — lộ trình monorepo + Discord/Zalo bot, DB đa nền tảng, CI/CD độc lập
- `apps/messenger-bot/docs/project-overview.md` — kiến trúc, API, cron, runbook quota (nội dung chủ yếu về `apps/messenger-bot`)
- `apps/messenger-bot/docs/chat-rate-limit-quota.md` — rate limit V1 + H1–H7
- `apps/messenger-bot/docs/edge-cases-roadmap.md` — gap toàn POC + phase khắc phục
- `apps/messenger-bot/docs/study-session-reminder.md` — nhắc lịch học chi tiết

| Path | Mục đích |
|------|----------|
| `.claude/settings.json` | Permissions (allow npm/git; deny `.env`, destructive git) |
| `.claude/rules/` | Conventions theo module — lazy-load khi sửa file matching |
| `.claude/skills/` | Workflows gọi bằng `/tên-skill` hoặc auto khi relevant |

### Skills có sẵn

| Skill | Khi dùng |
|-------|----------|
| `/study-reminder-debug` | Debug jobs nhắc lịch, sync, dispatch |
| `/typeorm-migration` | Thêm/sửa entity + migration |
| `/edit-llm-prompt` | Sửa `apps/messenger-bot/src/shared/prompts/*.system.txt` |
| `/verify` | `format` + `verify` (lint, typecheck, test, build) trước khi xong task |

Rule path-scoped tự load khi sửa file matching — xem bảng Rules bên dưới.

### Rules

- `project-conventions.md` — luôn load (quy ước chung)
- `clean-architecture.md` — **đọc khi sửa `apps/*/src/modules/`** (4 tầng, ports, DI) — bao gồm ranh giới `packages/llm-agent` (framework-agnostic, không import Nest)
- `chat-rate-limit.md` — `apps/messenger-bot/src/modules/chat-rate-limit/**`
- `messenger-chat.md` — `apps/messenger-bot/src/modules/messenger/application/services/messenger-chat*`
- `study-reminder.md` — `apps/messenger-bot/src/modules/study-reminder/**`
- `database.md` — `apps/messenger-bot/src/infrastructure/database/**`
- `prompts.md` — `apps/messenger-bot/src/shared/prompts/**` + `packages/llm-agent/src/messages.ts`

## Agent skills

### Issue tracker

GitHub Issues (`gh` CLI). External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles mapped to default label names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Không làm trừ khi user yêu cầu

Commit/push · thêm queue (Redis/Bull) · sửa `.env` · force push

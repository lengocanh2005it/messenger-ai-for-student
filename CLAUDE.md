# demo_send_message_fb

POC NestJS — Facebook Messenger cho học viên WISPACE: báo cáo AI + nhắc lịch học.

## Stack

NestJS 11 · TypeScript · TypeORM · PostgreSQL (shared) · OpenAI · Meta Graph API

## Lệnh thường dùng

```bash
npm run start:dev
npm run build
npm run test
npm run migration:run
npm run study-reminder:jobs
```

## Cấu hình Claude Code (`.claude/`)

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
| `/edit-llm-prompt` | Sửa `src/shared/prompts/*.system.txt` |
| `/verify` | `build` + `test` + `lint` trước khi xong task |

### Rules

- `project-conventions.md` — luôn load (quy ước chung)
- `clean-architecture.md` — **đọc khi sửa `src/modules/`** (4 tầng, ports, DI)
- `study-reminder.md` — `src/modules/study-reminder/**`
- `database.md` — `src/infrastructure/database/**`
- `prompts.md` — `src/shared/prompts/**`

## Tài liệu đầy đủ

- **[AGENTS.md](./AGENTS.md)** — chuẩn cross-agent (Codex, Cursor, Claude)
- `docs/project-overview.md` — kiến trúc, API, cron
- `docs/study-session-reminder.md` — nhắc lịch học chi tiết

## Không làm trừ khi user yêu cầu

Commit/push · thêm queue (Redis/Bull) · sửa `.env` · force push

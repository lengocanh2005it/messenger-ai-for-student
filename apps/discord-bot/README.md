# @wispace/discord-bot

Discord bot cho WISPACE — dùng [Necord](https://necord.org/) (wrapper NestJS quanh `discord.js`) + `@wispace/llm-agent` (orchestration LLM function-calling dùng chung mọi bot).

Xem kế hoạch đầy đủ ở [docs/turborepo-migration-plan.md](../../docs/turborepo-migration-plan.md) — Phase 3.

## Trạng thái hiện tại

Đã có: bot online qua Necord, nhận DM, trả lời qua `@wispace/llm-agent` (chống prompt-injection, redirect ngoài phạm vi WISPACE, lịch sử hội thoại in-memory theo process). Quota/rate-limit + LLM usage/safety event persistence dùng chung `@wispace/chat-metering` (platform='discord') — xem `modules/chat-metering/`. Account-linking Discord ↔ WISPACE userId qua OAuth2 — xem [docs/discord-account-linking.md](docs/discord-account-linking.md) (contract cho WISPACE backend team). 5/7 tool WISPACE gọi Wispace API thật qua `@wispace/wispace-client` (`modules/wispace/`, header `x-discordid`): `get_user_goals`, `get_learning_progress_report`, `get_upcoming_study_sessions`, `list_study_calendar_entries`, `preview_next_study_reminder`. Prompt riêng: `src/shared/prompts/discord-chat.system.txt`.

**Chưa có (khác Messenger, cần làm tiếp):**

- `reschedule_study_session`, `register_exam_report_notifications` — vẫn stub, cần thiết kế UX Discord riêng (xác nhận đổi lịch qua message components, semantics thông báo trước ngày thi).
- Chat history bền vững (Redis/multi-pod) — hiện chỉ Map trong process, mất khi restart.
- Whitelist, quota-event audit table, stuck-reserved recovery, ops CLI (Messenger-only hiện tại).

## Chạy dev

```bash
cp .env.example .env   # điền DISCORD_BOT_TOKEN + OPENAI_API_KEY
npx turbo run build --filter=@wispace/discord-bot...   # build trước (llm-agent là dependency)
npm run start:dev --workspace=apps/discord-bot
```

Bot cần intent `MESSAGE CONTENT INTENT` bật trong Discord Developer Portal (Bot settings) để đọc nội dung DM. App giờ chạy như HTTP server (`PORT`, mặc định `3001`) để expose `GET /discord/oauth/callback` cho account-linking.

## Lệnh thường dùng (trong `apps/discord-bot/`)

```bash
npm run start:dev
npm run build
npm run test
npm run verify   # format:check + lint + typecheck + test + build
```

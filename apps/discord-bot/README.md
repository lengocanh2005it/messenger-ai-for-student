# @wispace/discord-bot

Discord bot cho WISPACE — dùng [Necord](https://necord.org/) (wrapper NestJS quanh `discord.js`) + `@wispace/llm-agent` (orchestration LLM function-calling dùng chung mọi bot).

Xem kế hoạch đầy đủ ở [docs/turborepo-migration-plan.md](../../docs/turborepo-migration-plan.md) — Phase 3.

## Trạng thái hiện tại

**Đã có:**
- Bot online qua Necord, nhận DM + @mention trong server channel (reply qua DM), chống prompt-injection, redirect ngoài phạm vi WISPACE, lịch sử hội thoại in-memory theo process.
- Quota/rate-limit + LLM usage/safety event persistence dùng chung `@wispace/chat-metering` (platform='discord') — xem `modules/chat-metering/`.
- Account-linking Discord ↔ WISPACE userId qua OAuth2 (`GET /discord/oauth/callback`) — xem [docs/discord-account-linking.md](docs/discord-account-linking.md).
- 6/7 tool WISPACE gọi Wispace API thật qua `@wispace/wispace-client` (header `x-discordid`): `get_user_goals`, `get_learning_progress_report`, `get_upcoming_study_sessions`, `list_study_calendar_entries`, `preview_next_study_reminder`, `reschedule_study_session` (confirm/cancel qua Discord button).
- `GET /health` cho health check deploy.
- Prompt riêng: `src/shared/prompts/discord-chat.system.txt`.

**Chưa có / ghi nợ:**
- `register_exam_report_notifications` — vẫn stub; chỉ làm khi port cron báo cáo định kỳ sang Discord (không cần opt-in như Messenger vì không có giới hạn 24h).
- CI/CD deploy VPS — workflow + script + Dockerfile đã viết, chưa chạy thật.
- Chat history bền vững (Redis/multi-pod) — hiện chỉ Map trong process, mất khi restart.
- Whitelist, quota-event audit table, stuck-reserved recovery, ops CLI (Messenger-only hiện tại).

## Chạy dev

```bash
cp .env.example .env   # điền DISCORD_BOT_TOKEN + OPENAI_API_KEY
npx turbo run build --filter=@wispace/discord-bot...   # build trước (llm-agent là dependency)
npm run start:dev --workspace=apps/discord-bot
```

Bot cần các intent sau bật trong Discord Developer Portal (Bot settings):
- `MESSAGE CONTENT INTENT` — đọc nội dung DM và tin nhắn có @mention ✅
- `SERVER MEMBERS INTENT` — nhận event `guildMemberAdd` để auto-complete account link ✅

App giờ chạy như HTTP server (`PORT`, mặc định `3001`) để expose `GET /discord/oauth/callback` cho account-linking.

## Lệnh thường dùng (trong `apps/discord-bot/`)

```bash
npm run start:dev
npm run build
npm run test
npm run verify   # format:check + lint + typecheck + test + build
```

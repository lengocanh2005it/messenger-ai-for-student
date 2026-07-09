# @wispace/discord-bot

Discord bot for WISPACE — uses [Necord](https://necord.org/) (NestJS wrapper around `discord.js`) + `@wispace/llm-agent` (shared LLM function-calling orchestration used by all bots).

See the full plan at [docs/turborepo-migration-plan.md](../../docs/turborepo-migration-plan.md) — Phase 3.

## Current status

**Implemented:**
- Bot online via Necord, receives DMs + @mentions in server channels (replies via DM), prompt-injection prevention, out-of-scope WISPACE redirect, in-memory conversation history per process.
- Quota/rate-limit + LLM usage/safety event persistence using shared `@wispace/chat-metering` (platform='discord') — see `modules/chat-metering/`.
- Account-linking Discord ↔ WISPACE userId via OAuth2 (`GET /discord/oauth/callback`) — see [docs/discord-account-linking.md](docs/discord-account-linking.md).
- 6/7 WISPACE tools calling the real Wispace API via `@wispace/wispace-client` (header `x-discordid`): `get_user_goals`, `get_learning_progress_report`, `get_upcoming_study_sessions`, `list_study_calendar_entries`, `preview_next_study_reminder`, `reschedule_study_session` (confirm/cancel via Discord button).
- `GET /health` for deploy health checks.
- Custom prompt: `src/shared/prompts/discord-chat.system.txt`.

**Not yet implemented / outstanding:**
- `register_exam_report_notifications` — still a stub; only implement when porting the periodic report cron to Discord (no opt-in needed like Messenger since there is no 24h messaging limit).
- CI/CD deploy VPS — workflow + script + Dockerfile written but not yet run in production.
- Persistent chat history (Redis/multi-pod) — currently only an in-process Map, lost on restart.
- Whitelist, quota-event audit table, stuck-reserved recovery, ops CLI (Messenger-only for now).

## Dev setup

```bash
cp .env.example .env   # fill in DISCORD_BOT_TOKEN + OPENAI_API_KEY
npx turbo run build --filter=@wispace/discord-bot...   # build first (llm-agent is a dependency)
npm run start:dev --workspace=apps/discord-bot
```

The bot needs the following intents enabled in the Discord Developer Portal (Bot settings):
- `MESSAGE CONTENT INTENT` — read DM content and @mention messages ✅
- `SERVER MEMBERS INTENT` — receive `guildMemberAdd` events for auto-complete account linking ✅

The app runs as an HTTP server (`PORT`, default `3001`) to expose `GET /discord/oauth/callback` for account linking.

## Common commands (in `apps/discord-bot/`)

```bash
npm run start:dev
npm run build
npm run test
npm run verify   # format:check + lint + typecheck + test + build
```
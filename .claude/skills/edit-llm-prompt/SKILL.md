---
name: edit-llm-prompt
description: Edit LLM system prompts for student reports or study reminders. Use when user asks to change nội dung báo cáo, nhắc lịch, LLM prompt, or tone of Messenger messages.
---

# Edit LLM prompt

## Files

| Prompt | Service |
|--------|---------|
| `apps/messenger-bot/src/shared/prompts/student-report.system.txt` | Báo cáo học tập |
| `apps/messenger-bot/src/shared/prompts/study-reminder.system.txt` | Nhắc lịch học |
| `apps/messenger-bot/src/shared/prompts/messenger-chat.system.txt` | Chat AI (function-calling qua `@wispace/llm-agent`) |

Read `.claude/rules/prompts.md` before editing.

## Workflow

1. Sửa `.system.txt` — output hướng tới tin Messenger tiếng Việt.
2. `npx turbo run build --filter=@wispace/messenger-bot...` (copy sang `apps/messenger-bot/dist/shared/prompts/`).
3. Test: menu bot preview hoặc `POST /messenger/send-reports` với `{ "psid": "..." }` (ops key).

## Không làm

- Inline prompt dài vào `*.service.ts`.
- Hardcode nội dung tin trong service thay vì prompt (trừ fallback khi không có API key).
- Sửa `packages/llm-agent/src/messages.ts` (thông báo redirect/injection blocked) tưởng là prompt — đây là code TS dùng chung cho mọi bot, không phải file `.system.txt`.

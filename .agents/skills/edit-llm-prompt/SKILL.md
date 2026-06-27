---
name: edit-llm-prompt
description: Edit OpenAI system prompts for student reports or study reminders. Use when user asks to change nội dung báo cáo, nhắc lịch, LLM prompt, or tone of Messenger messages.
---

# Edit LLM prompt

## Files

| Prompt | Service |
|--------|---------|
| `src/shared/prompts/student-report.system.txt` | Báo cáo học tập |
| `src/shared/prompts/study-reminder.system.txt` | Nhắc lịch học |

Read `.Codex/rules/prompts.md` before editing.

## Workflow

1. Sửa `.system.txt` — output hướng tới tin Messenger tiếng Việt.
2. `npm run build` (copy sang `dist/shared/prompts/`).
3. Test: menu bot preview hoặc `POST /messenger/send-reports` với `{ "psid": "..." }` (ops key).

## Không làm

- Inline prompt dài vào `*.service.ts`.
- Hardcode nội dung tin trong service thay vì prompt (trừ fallback khi không có API key).

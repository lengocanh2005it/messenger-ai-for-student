---
alwaysApply: false
paths: apps/messenger-bot/src/shared/prompts/**,packages/llm-agent/src/messages.ts
---

# LLM system prompts

Prompt Messenger nằm trong `apps/messenger-bot/src/shared/prompts/*.system.txt`, load qua `@wispace/llm-agent`'s `loadSystemPromptFile()` (gọi từ `messenger-agent.service.ts`, truyền path riêng của app). Nội dung nhắc "Facebook Messenger" trực tiếp nên **không** dùng chung với Discord/Zalo — mỗi bot tự có file prompt riêng khi triển khai (xem `docs/turborepo-migration-plan.md` Phase 3/4).

| File | Service |
|------|---------|
| `apps/messenger-bot/src/shared/prompts/student-report.system.txt` | `modules/student-report/application/services/student-report.service.ts` |
| `apps/messenger-bot/src/shared/prompts/study-reminder.system.txt` | `modules/study-reminder/application/services/study-reminder.service.ts` |
| `apps/messenger-bot/src/shared/prompts/messenger-chat.system.txt` | `modules/messenger/application/agent/messenger-agent.service.ts` (adapter — orchestration loop thật nằm ở `packages/llm-agent`) |

Thông báo dùng chung (không đặc thù platform) — `buildPromptInjectionBlockedMessage`, `buildWispaceScopeRedirectMessage` — đã tách vào `packages/llm-agent/src/messages.ts`, dùng chung cho mọi bot.

## Sau khi sửa prompt Messenger

```bash
npx turbo run build --filter=@wispace/messenger-bot...
```

Nest copy assets sang `apps/messenger-bot/dist/shared/prompts/` (`nest-cli.json` → `assets`).

## Quy ước

- Không inline prompt dài trong application service.
- Nội dung tin nhắn output: tiếng Việt, thân thiện, ngắn gọn phù hợp Messenger.
- Thiếu `OPENAI_API_KEY` → fallback template cứng (xử lý trong `LlmAgentService.reply()` ở `packages/llm-agent`, không gọi API).
- Không đưa string từ user/WISPACE thẳng vào LLM nếu có thể chứa instruction: dùng `sanitizeUntrustedTextForLlm` (từ `@wispace/llm-agent`) cho field đơn lẻ và `sanitizeToolResultContent` cho tool result JSON.
- Output JSON từ model không được cast thẳng rồi format; parse + validate shape bằng `llm-json-output.utils.ts` (app), lỗi thì fallback template.

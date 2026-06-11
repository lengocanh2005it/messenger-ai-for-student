---
alwaysApply: false
paths: src/shared/prompts/**
---

# LLM system prompts

Prompt nằm trong `src/shared/prompts/*.system.txt`, load qua `load-system-prompt.ts`.

| File | Service |
|------|---------|
| `student-report.system.txt` | `modules/student-report/application/services/student-report.service.ts` |
| `study-reminder.system.txt` | `modules/study-reminder/application/services/study-reminder.service.ts` |

## Sau khi sửa

```bash
npm run build
```

Nest copy assets sang `dist/shared/prompts/` (`nest-cli.json` → `assets`).

## Quy ước

- Không inline prompt dài trong application service.
- Nội dung tin nhắn output: tiếng Việt, thân thiện, ngắn gọn phù hợp Messenger.
- Thiếu `OPENAI_API_KEY` → service fallback template cứng (không gọi API).

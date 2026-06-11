---
alwaysApply: false
paths: src/prompts/**
---

# LLM system prompts

Prompt nằm trong `src/prompts/*.system.txt`, load qua `load-system-prompt.ts`.

| File | Service |
|------|---------|
| `student-report.system.txt` | `StudentReportService` |
| `study-reminder.system.txt` | `StudyReminderService` |

## Sau khi sửa

```bash
npm run build
```

Nest copy assets sang `dist/prompts/` (`nest-cli.json` → `assets`).

## Quy ước

- Không inline prompt dài trong service.
- Nội dung tin nhắn output: tiếng Việt, thân thiện, ngắn gọn phù hợp Messenger.
- Thiếu `OPENAI_API_KEY` → service fallback template cứng (không gọi API).

# Tài liệu dự án

POC **WISPACE × Facebook Messenger** — báo cáo học tập, nhắc lịch học và chat AI hai chiều IELTS qua Messenger (OpenAI).

| Tài liệu | Nội dung |
|----------|----------|
| [project-overview.md](./project-overview.md) | Tổng quan: tính năng, kiến trúc, DB, API, cron, env, runbook quota (mục 12) |
| [chat-rate-limit-quota.md](./chat-rate-limit-quota.md) | Rate limit chat **V1 ✓** + hardening **H1–H7 ✓**; ops scripts; scale `CHAT_QUEUE_SHARED` |
| [edge-cases-roadmap.md](./edge-cases-roadmap.md) | Gap toàn dự án (link, báo cáo, nhắc lịch, chat, ops) + phase khắc phục |
| [study-session-reminder.md](./study-session-reminder.md) | Nhắc lịch: sync → jobs → dispatch → LLM; `POST /messenger/study-calendar/sync` |

Hướng dẫn AI agent: [AGENTS.md](../AGENTS.md). Quy tắc tầng code: `.claude/rules/clean-architecture.md`.

## Tích hợp Wispace (nhắc lịch học)

Sau mỗi lần tạo / sửa / xóa lịch trên API Wispace (`POST` / `DELETE` `/api/UserCalendar`):

```http
POST {messenger-service}/messenger/study-calendar/sync
Content-Type: application/json
X-Internal-Api-Key: {INTERNAL_API_KEY}

{ "userId": 2597 }
```

Chi tiết: [study-session-reminder.md §3.6](./study-session-reminder.md#36-api-sync-khi-lịch-học-thay-đổi).

## Ops chat quota (nhanh)

```bash
npm run chat-quota:status
npm run chat-quota:recover-stuck -- --dry-run
npm run chat-quota:cleanup -- --dry-run
```

Scale ≥2 instance: `CHAT_QUEUE_SHARED=true` + `npm run migration:run` — xem [project-overview.md §12](./project-overview.md#12-runbook--rate-limit-chat-v1).

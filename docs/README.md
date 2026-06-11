# Tài liệu dự án

POC **WISPACE × Facebook Messenger** — gửi báo cáo học tập và nhắc lịch học IELTS qua Messenger, nội dung sinh bằng OpenAI.

| Tài liệu | Nội dung |
|----------|----------|
| [project-overview.md](./project-overview.md) | Tổng quan POC: tính năng, kiến trúc, cấu trúc code, DB, HTTP API, cron, scripts |
| [study-session-reminder.md](./study-session-reminder.md) | Nhắc lịch học: sync → jobs → dispatch → LLM; API `UserCalendar`; `POST /messenger/study-calendar/sync`; trade-off |
| [chat-rate-limit-quota.md](./chat-rate-limit-quota.md) | Rate limit chat AI: 3 hướng lưu quota, trade-off, đề xuất `messenger_chat_daily_usage` |

Hướng dẫn cho AI agent / Cursor: [AGENTS.md](../AGENTS.md).

## Tích hợp Wispace (nhắc lịch học)

Sau mỗi lần tạo / sửa / xóa lịch trên API Wispace (`POST` / `DELETE` `/api/UserCalendar`):

```http
POST {messenger-service}/messenger/study-calendar/sync
Content-Type: application/json
X-Internal-Api-Key: {INTERNAL_API_KEY}

{ "userId": 2597 }
```

Chi tiết request/response và luồng: [study-session-reminder.md §3.6](./study-session-reminder.md#36-api-sync-khi-lịch-học-thay-đổi).

# Tài liệu dự án

POC **WISPACE × Facebook Messenger** — báo cáo học tập, nhắc lịch học và chat AI hai chiều IELTS qua Messenger (OpenAI).

| Tài liệu | Nội dung |
|----------|----------|
| [project-overview.md](./project-overview.md) | Tổng quan: tính năng, kiến trúc, DB, API, cron, env, runbook quota (mục 12) |
| [chat-rate-limit-quota.md](./chat-rate-limit-quota.md) | Rate limit chat **V1 ✓** + hardening **H1–H7 ✓**; ops scripts; scale `CHAT_QUEUE_SHARED` |
| [edge-cases-roadmap.md](./edge-cases-roadmap.md) | Gap toàn dự án (link, báo cáo, nhắc lịch, chat, ops) + phase khắc phục |
| [messenger-link-security.md](./messenger-link-security.md) | Bảo mật `ref` / `userId`: rủi ro IDOR, HMAC vs one-time token, trade-off, phase L4 |
| [messenger-link-integration.md](./messenger-link-integration.md) | Luồng link chi tiết (hiện tại vs L4) + **contract API WISPACE** (body/response) |
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

## Ops (I1 + S1)

```bash
npm run ops:health
npm run chat-quota:status -- --ops
npm run study-reminder:jobs -- --failed
npm run study-reminder:jobs -- --stuck
```

Runbook đầy đủ: [project-overview.md §12](./project-overview.md#12-runbook--rate-limit-chat-v1).

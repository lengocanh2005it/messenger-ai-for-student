# messenger-ai-for-student

POC **WISPACE × Facebook Messenger** — NestJS service gửi báo cáo học tập IELTS, nhắc lịch học và **chat AI hai chiều** qua Messenger, nội dung cá nhân hóa bằng OpenAI.

## Tính năng

- Liên kết học viên WISPACE với Messenger (`m.me` + webhook)
- Báo cáo tiến độ AI trước ngày thi (cron + menu)
- Nhắc buổi học sắp tới (outbox jobs + LLM + cron)
- Chat tự do có **rate limit** (quota ngày, burst, H1–H7 hardening)
- Wispace gọi `POST /messenger/study-calendar/sync` sau khi đổi lịch `UserCalendar`

## Tài liệu

| File | Mô tả |
|------|--------|
| [docs/project-overview.md](docs/project-overview.md) | Kiến trúc, cấu trúc code, DB, API, cron, runbook quota |
| [docs/chat-rate-limit-quota.md](docs/chat-rate-limit-quota.md) | Rate limit chat V1 + H1–H7 |
| [docs/edge-cases-roadmap.md](docs/edge-cases-roadmap.md) | Gap toàn POC + checklist QA + phase khắc phục |
| [docs/study-session-reminder.md](docs/study-session-reminder.md) | Nhắc lịch học (chi tiết) |
| [docs/README.md](docs/README.md) | Mục lục tài liệu |
| [AGENTS.md](AGENTS.md) | Hướng dẫn cho AI agent / Cursor |

## Chạy nhanh

```bash
npm install
cp .env.example .env   # điền PAGE_ACCESS_TOKEN, DB, OPENAI_API_KEY, ...
npm run migration:run
npm run start:dev
```

Webhook Meta: `GET/POST /webhook`  
Cấu hình menu bot: `POST /messenger/profile/setup`  
Wispace sync lịch: `POST /messenger/study-calendar/sync` + header `X-Internal-Api-Key` (xem `.env` `INTERNAL_API_KEY`)

## Scripts hữu ích

```bash
npm run study-reminder:sync      # Bootstrap + sync jobs nhắc lịch
npm run study-reminder:jobs      # Xem study_reminder_jobs (--failed, --stuck)
npm run ops:health               # I1+S1 ops snapshot
npm run chat-quota:status        # Tra quota chat (--ops = fleet summary)
npm run chat-quota:recover-stuck # H2: refund stuck reserved
npm run chat-quota:cleanup       # H6: cleanup idempotency cũ
npm run db:inspect
```

## Stack

NestJS 11 · TypeORM · PostgreSQL · OpenAI · Facebook Graph API

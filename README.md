# demo_send_message_fb

POC **WISPACE × Facebook Messenger** — NestJS service gửi báo cáo học tập IELTS và nhắc lịch học qua Messenger, nội dung cá nhân hóa bằng OpenAI.

## Tính năng

- Liên kết học viên WISPACE với Messenger (`m.me` + webhook)
- Báo cáo tiến độ AI trước ngày thi (cron + menu)
- Nhắc buổi học sắp tới (outbox jobs + LLM + cron)
- Wispace gọi `POST /messenger/study-calendar/sync` sau khi đổi lịch `UserCalendar`

## Tài liệu

| File | Mô tả |
|------|--------|
| [docs/project-overview.md](docs/project-overview.md) | Kiến trúc, cấu trúc code, DB, API, cron |
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
Wispace sync lịch: `POST /messenger/study-calendar/sync` body `{ "userId": 2597 }`

## Scripts hữu ích

```bash
npm run study-reminder:sync      # Bootstrap + sync jobs nhắc lịch
npm run study-reminder:jobs      # Xem study_reminder_jobs
npm run db:inspect
```

## Stack

NestJS 11 · TypeORM · PostgreSQL · OpenAI · Facebook Graph API

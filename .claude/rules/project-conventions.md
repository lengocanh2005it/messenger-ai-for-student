# Quy ước chung — demo_send_message_fb

POC NestJS: Messenger webhook + báo cáo AI + nhắc lịch học cho WISPACE.

## Nguyên tắc

- Diff nhỏ; tái dùng module hiện có.
- Config qua `.env` + `ConfigService` — không hardcode token/số thời gian.
- Tin nhắn user-facing: **tiếng Việt**. Log/comment: EN hoặc Việt ngắn.
- Không thêm Redis/Bull/SQS trừ khi user yêu cầu — outbox = bảng `study_reminder_jobs`.

## Ranh giới module

| Module | Chỉ làm |
|--------|---------|
| `messenger/` | Webhook, Send API, menu, mapping/logs |
| `student-report/` | Báo cáo học tập, Wispace API goals/scores |
| `study-reminder/` | Sync/dispatch/cleanup jobs, UserCalendar API |
| `scheduler/` | Cron báo cáo thi + HTTP ops trigger |

**Không** nhét logic study reminder vào `MessengerService`.

## Auth & API

- Wispace API: header `x-psid` (PSID Messenger).
- Ops HTTP: `X-Internal-Api-Key` hoặc `Authorization: Bearer` = `INTERNAL_API_KEY`.
- Không commit `.env`.

## Tài liệu

- Tổng quan: `docs/project-overview.md`
- Nhắc lịch học: `docs/study-session-reminder.md`
- Agent chung (Codex/Cursor): `AGENTS.md`

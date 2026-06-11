# Quy ước chung — demo_send_message_fb

POC NestJS Clean Architecture: Messenger webhook + báo cáo AI + nhắc lịch học cho WISPACE.

**Đọc thêm:** `.claude/rules/clean-architecture.md` — bắt buộc khi thêm/sửa code trong `src/modules/`.

## Nguyên tắc

- Diff nhỏ; đúng tầng Clean Architecture (domain / application / infrastructure / presentation).
- Config qua `.env` + `ConfigService` — không hardcode token/số thời gian.
- Tin nhắn user-facing: **tiếng Việt**. Log/comment: EN hoặc Việt ngắn.
- Không thêm Redis/Bull/SQS trừ khi user yêu cầu — outbox = bảng `study_reminder_jobs`.

## Ranh giới module

| Module | Chỉ làm |
|--------|---------|
| `modules/messenger/` | Webhook, Send API (outbound), menu, mapping/logs |
| `modules/student-report/` | Báo cáo học tập, Wispace API goals/scores |
| `modules/study-reminder/` | Sync/dispatch/cleanup jobs, UserCalendar API |
| `modules/scheduler/` | Cron báo cáo thi + HTTP ops trigger |

**Không** nhét logic study reminder vào `MessengerService` (webhook chỉ orchestrate).

## Auth & API

- Wispace API: header `x-psid` (PSID Messenger).
- Ops HTTP: `X-Internal-Api-Key` hoặc `Authorization: Bearer` = `INTERNAL_API_KEY`.
- Không commit `.env`.

## Tài liệu

- Kiến trúc: `.claude/rules/clean-architecture.md`
- Tổng quan: `docs/project-overview.md`
- Nhắc lịch học: `docs/study-session-reminder.md`
- Agent chung: `AGENTS.md`

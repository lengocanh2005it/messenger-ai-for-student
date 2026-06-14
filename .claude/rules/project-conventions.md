# Quy ước chung — demo_send_message_fb

POC NestJS Clean Architecture: Messenger webhook + báo cáo AI + nhắc lịch học + **chat AI có rate limit** cho WISPACE.

**Đọc thêm:** `.claude/rules/clean-architecture.md` — bắt buộc khi thêm/sửa code trong `src/modules/`.

## Nguyên tắc

- Diff nhỏ; đúng tầng Clean Architecture (domain / application / infrastructure / presentation).
- Config qua `.env` + `ConfigService` — không hardcode token/số thời gian.
- Tin nhắn user-facing: **tiếng Việt**. Log/comment: EN hoặc Việt ngắn.
- Không thêm Redis/Bull/SQS trừ khi user yêu cầu — outbox = `study_reminder_jobs`; chat shared queue = PostgreSQL (H7).

## Ranh giới module

| Module | Chỉ làm |
|--------|---------|
| `modules/messenger/` | Webhook, Send API (outbound), menu, chat queue/agent, mapping/logs |
| `modules/chat-rate-limit/` | Quota FREE_FORM: reserve/refund/burst, idempotency DB |
| `modules/student-report/` | Báo cáo học tập, Wispace API goals/scores |
| `modules/study-reminder/` | Sync/dispatch/cleanup jobs, UserCalendar API |
| `modules/scheduler/` | Cron báo cáo thi + HTTP ops trigger |

**Không** nhét logic study reminder vào `MessengerService`. **Không** reserve quota trong webhook — chỉ tại `MessengerChatQueueService` flush.

## Auth & API

- Wispace API: header `x-psid` (PSID Messenger).
- Ops HTTP: `X-Internal-Api-Key` hoặc `Authorization: Bearer` = `INTERNAL_API_KEY`.
- Không commit `.env`.

## Tài liệu

- Kiến trúc: `.claude/rules/clean-architecture.md`
- Tổng quan: `docs/project-overview.md`
- Rate limit chat: `docs/chat-rate-limit-quota.md` — rule: `.claude/rules/chat-rate-limit.md`
- Nhắc lịch học: `docs/study-session-reminder.md`
- Agent chung: `AGENTS.md`

## Khi sửa code (bắt buộc)

1. **Cập nhật tài liệu agent** nếu hành vi/API/env/runbook đổi — xem bảng trong `AGENTS.md` mục *Docs & skills khi đổi code*.
2. **Cập nhật skill** trong `.claude/skills/` nếu workflow debug/verify/migration/prompt bị ảnh hưởng.
3. **Chạy quality gate** trước khi báo xong task (cần `npm ci` đầy đủ dev deps):

```bash
npm run format          # sửa format trước
npm run verify          # format:check + lint + typecheck + test + build
```

Hoặc từng bước: `npm run lint` → `npm run typecheck` → `npm run test` → `npm run build`.

**Lưu ý:** `npm run test` fail với `'jest' is not recognized` nếu vừa chạy `npm ci --omit=dev` — chạy lại `npm ci`.

## Ops nhanh (chat quota)

```bash
npm run chat-quota:status
npm run chat-quota:recover-stuck
npm run chat-quota:cleanup
```

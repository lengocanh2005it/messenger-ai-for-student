---
alwaysApply: false
paths: src/modules/chat-rate-limit/**
---

# Chat rate limit module

Quota FREE_FORM cho chat AI hai chiều. V1 + hardening **H1–H7 ✓**.

## Luồng (hook reserve)

```
Webhook text → MessengerChatQueueService.enqueue → debounce flush
  → ChatRateLimitService.reserveFreeFormSlot (DB idempotency + daily usage, hard cap H3)
  → MessengerAgentService → Send API
  → markCompleted; lỗi trước bubble đầu → refund (H4)
```

Reserve **không** gọi từ webhook — chỉ từ `MessengerChatQueueService` khi flush.

Postback menu, nhắc lịch cron, báo cáo proactive **không** qua module này.

## Config (`.env`)

| Nhóm | Biến chính |
|------|------------|
| Bật/tắt | `CHAT_RATE_LIMIT_ENABLED`, `CHAT_RATE_LIMIT_WHITELIST_PSIDS` |
| Limit | `CHAT_FREE_FORM_DAILY_LIMIT`, `CHAT_BURST_PER_MINUTE`, `CHAT_BURST_STORE` (R3), `CHAT_USAGE_TIMEZONE` |
| H2 stuck | `CHAT_IDEMPOTENCY_STUCK_RESERVED_MS` |
| H5 abuse | `CHAT_MERGED_TEXT_MAX_CHARS`, `CHAT_BURST_COUNT_REFUNDED` |
| H6 ops | `CHAT_IDEMPOTENCY_RETENTION_DAYS` |
| C2 Q0 | `CHAT_QUOTA_EVENTS_ENABLED`, `CHAT_QUOTA_EVENTS_RETENTION_DAYS`, `chat-quota:rebuild` |
| UX | `CHAT_QUOTA_REMAINING_HINT_THRESHOLD` |

Thêm biến mới → cập nhật `.env.example`.

## File chính (Clean Architecture)

| File | Tầng | Vai trò |
|------|------|---------|
| `application/services/chat-rate-limit.service.ts` | application | checkQuota, reserve, refund, markCompleted, recover stuck |
| `application/services/chat-rate-limit-config.service.ts` | application | Đọc env, whitelist |
| `infrastructure/persistence/chat-rate-limit.repository.ts` | infrastructure | Transaction idempotency + UPSERT count (H3 hard cap) |
| `infrastructure/persistence/*-chat-burst-counter.ts` | infrastructure | Burst counter memory/postgres/redis (R3) |
| `domain/repositories/chat-rate-limit.repository.port.ts` | domain | Port + token `CHAT_RATE_LIMIT_REPOSITORY` |

**Consumer:** `MessengerChatQueueService` inject `ChatRateLimitService` (import `ChatRateLimitModule`).

## Hardening đã có (đừng regress)

| Phase | Hành vi |
|-------|---------|
| H2 | Conflict `mid` → `recoverIdempotencyForRetry`; stuck `reserved` → refund |
| H3 | `reserveFreeFormSlotInTransaction` — `WHERE free_form_count < limit` |
| H4 | Quota policy ở queue service (partial send không refund) |
| H5 | Cap merge text; burst không đếm `refunded` mặc định |
| H6 | Log `CHAT_QUOTA_DENY` / `REFUND` / `RECOVERED`; script cleanup |

## Ops scripts

```bash
npm run chat-quota:status
npm run chat-quota:recover-stuck -- --dry-run
npm run chat-quota:cleanup -- --dry-run
```

## Test

- `application/services/chat-rate-limit.service.spec.ts`
- `infrastructure/persistence/chat-rate-limit.repository.spec.ts`
- Sửa reserve/refund/hard cap → cập nhật spec tương ứng

## Tài liệu

`docs/chat-rate-limit-quota.md` — kiến trúc, §5.10 H1–H7, runbook.

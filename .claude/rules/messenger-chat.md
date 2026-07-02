---
alwaysApply: false
paths: apps/messenger-bot/src/modules/messenger/application/services/messenger-chat*
---

# Messenger chat queue & shared state (H7 + R4)

Chat tự do: debounce → LLM agent → Send API. Tích hợp `ChatRateLimitModule` tại flush.

## Hai chế độ queue

| Mode | Env | Debounce buffer |
|------|-----|-----------------|
| Local (POC 1 instance) | `CHAT_QUEUE_STORE=memory` (default) | RAM trong process (`MessengerChatQueueService`) |
| Distributed (≥2 pod hoặc Redis) | `CHAT_QUEUE_STORE=redis` | Redis `chat:queue:buffer:{psid}` |

Legacy: `CHAT_QUEUE_SHARED=true` → `CHAT_QUEUE_STORE=redis` khi không set explicit.

`CHAT_QUEUE_STORE=postgres` **đã bỏ** (bảng `messenger_chat_queue_buffer` dropped) — dùng `redis` multi-pod.

## Chat queue store (R4)

| Backend | Env | Ghi chú |
|---------|-----|---------|
| Memory | `CHAT_QUEUE_STORE=memory` (default) | 1 pod POC — wraps `@wispace/chat-queue-core`'s `DebounceChatQueue` (package dùng chung mọi bot, xem `.claude/rules/clean-architecture.md`) |
| Redis | `CHAT_QUEUE_STORE=redis` + `REDIS_ENABLED=true` | `chat:queue:buffer:{psid}`, set `chat:queue:active-psids`, lock `chat:queue:lock:{psid}` |

Port: `CHAT_QUEUE_STORE` → `ChatQueueStoreResolver` (redis khi distributed).

## Chat history store (R1)

| Backend | Env | Ghi chú |
|---------|-----|---------|
| Memory | `CHAT_HISTORY_STORE=memory` (default) | 1 pod POC — wraps `@wispace/chat-history`'s `MemoryChatHistoryStore` (package dùng chung Discord, xem `.claude/rules/clean-architecture.md`) |
| Redis | `CHAT_HISTORY_STORE=redis` + `REDIS_ENABLED=true` | Key `chat:history:{psid}`, TTL `CHAT_HISTORY_TTL_MS` — Redis store không nằm trong package (đặc thù hạ tầng từng app) |

`CHAT_HISTORY_STORE=postgres` **đã bỏ** (bảng `messenger_chat_history` dropped).

Port: `CHAT_HISTORY_STORE` → `ChatHistoryStoreResolver`.

## Webhook dedupe store (R2)

| Backend | Env | Ghi chú |
|---------|-----|---------|
| Memory | `CHAT_DEDUPE_STORE=memory` (default) | `message.mid` + postback 15s trong RAM |
| Redis | `CHAT_DEDUPE_STORE=redis` + `REDIS_ENABLED=true` | `dedupe:mid:{mid}`, `dedupe:postback:{psid}:{payload}` |

`CHAT_DEDUPE_STORE=postgres` **đã bỏ** (bảng `messenger_chat_webhook_seen` dropped) — dùng `redis` multi-pod.

Port: `CHAT_DEDUPE_STORE` → `WebhookDedupeStoreResolver` — `MessengerService` không còn Map dedupe nội bộ.

## File chính

| File | Vai trò |
|------|---------|
| `messenger-chat-queue.service.ts` | Enqueue, debounce, flush, `processChatBatch`, reserve hook |
| `messenger-chat-history.service.ts` | Facade context LLM — delegate `CHAT_HISTORY_STORE` |
| `infrastructure/persistence/redis-chat-queue.store.ts` | Redis queue buffer (R4) |
| `infrastructure/persistence/chat-queue.store.resolver.ts` | Redis store khi distributed |
| `infrastructure/persistence/*-chat-history.store.ts` | memory / redis stores (R1) |
| `infrastructure/persistence/*-webhook-dedupe.store.ts` | memory / redis dedupe (R2) |
| `messenger-chat-shared-config.service.ts` | `CHAT_QUEUE_STORE`, `CHAT_QUEUE_SHARED`, TTL, stuck ms |
| `messenger-chat-queue-worker.service.ts` | Cron poll buffer Redis (2s) |

Port queue: `CHAT_QUEUE_STORE`. Port history: `CHAT_HISTORY_STORE`.

## Bảng DB (đã bỏ)

- `messenger_chat_queue_buffer` — dropped migration `1717747200010`
- `messenger_chat_history` — dropped migration `1717747200010`
- Webhook dedupe `mid` — Redis (`CHAT_DEDUPE_STORE=redis`) hoặc RAM; **không** còn bảng DB

## Quy ước flush

- Idempotency key = `message.mid` của **tin cuối** trong batch debounce
- 1 flush = 1 lượt (khi enforcement bật)
- Thiếu `mid` + enforcement → skip / `CHAT_MISSING_MID` (H5)

## Đổi lịch qua chat

- Tool `reschedule_study_session` **không** gọi Wispace ngay — `MessengerRescheduleConfirmationService` stage pending + nút postback.
- Chỉ khi user bấm `CONFIRM_RESCHEDULE` → `StudyCalendarCommandService.rescheduleSession`.
- Postback: `CONFIRM_RESCHEDULE` / `CANCEL_RESCHEDULE` trong `messenger.service.ts`.

## Test

- `messenger-chat-queue.service.spec.ts`
- `messenger-chat-queue.service.shared.spec.ts`
- `redis-chat-queue.store.spec.ts`
- `messenger-chat-history.service.spec.ts`

## Liên quan

- Quota logic: `.claude/rules/chat-rate-limit.md`
- Docs: `apps/messenger-bot/docs/chat-rate-limit-quota.md` §5.3, H7

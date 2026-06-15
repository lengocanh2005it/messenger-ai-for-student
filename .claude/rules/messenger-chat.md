---
alwaysApply: false
paths: src/modules/messenger/application/services/messenger-chat*
---

# Messenger chat queue & shared state (H7)

Chat tự do: debounce → LLM agent → Send API. Tích hợp `ChatRateLimitModule` tại flush.

## Hai chế độ queue

| Mode | Env | Debounce / mid dedupe |
|------|-----|------------------------|
| Local (POC 1 instance) | `CHAT_QUEUE_SHARED=false` | RAM trong process (hoặc Redis nếu `CHAT_HISTORY_STORE=redis`) |
| Shared (≥2 pod) | `CHAT_QUEUE_SHARED=true` | PostgreSQL buffer + cron poll |

## Chat history store (R1)

| Backend | Env | Ghi chú |
|---------|-----|---------|
| Memory | `CHAT_HISTORY_STORE=memory` (default) | 1 pod POC |
| PostgreSQL | `CHAT_HISTORY_STORE=postgres` hoặc `CHAT_QUEUE_SHARED=true` | Bảng `messenger_chat_history` |
| Redis | `CHAT_HISTORY_STORE=redis` + `REDIS_ENABLED=true` | Key `chat:history:{psid}`, TTL `CHAT_HISTORY_TTL_MS` |

Port: `CHAT_HISTORY_STORE` → `ChatHistoryStoreResolver` → memory/postgres/redis impl.

## File chính

| File | Vai trò |
|------|---------|
| `messenger-chat-queue.service.ts` | Enqueue, debounce, flush, `processChatBatch`, reserve hook |
| `messenger-chat-history.service.ts` | Facade context LLM — delegate `CHAT_HISTORY_STORE` |
| `infrastructure/persistence/*-chat-history.store.ts` | memory / postgres / redis stores (R1) |
| `infrastructure/persistence/chat-history.store.resolver.ts` | Chọn store theo `CHAT_HISTORY_STORE` |
| `messenger-chat-shared-config.service.ts` | `CHAT_QUEUE_SHARED`, TTL, stuck ms |
| `messenger-chat-queue-worker.service.ts` | Cron poll buffer (2s) + webhook dedupe cleanup |
| `infrastructure/persistence/messenger-chat-shared-state.repository.ts` | Buffer, history, webhook_seen |

Port: `MESSENGER_CHAT_SHARED_STATE_REPOSITORY` — bind trong `messenger.module.ts`.

## Bảng DB (H7 migration)

- `messenger_chat_queue_buffer` — debounce cross-pod
- `messenger_chat_history` — LLM turns (legacy khi `CHAT_HISTORY_STORE=postgres`; redis/memory không ghi bảng)
- `messenger_chat_webhook_seen` — dedupe `message.mid` cross-pod

## Quy ước flush

- Idempotency key = `message.mid` của **tin cuối** trong batch debounce
- 1 flush = 1 lượt (khi enforcement bật)
- Thiếu `mid` + enforcement → skip / `CHAT_MISSING_MID` (H5)

## Test

- `messenger-chat-queue.service.spec.ts`
- `messenger-chat-queue.service.shared.spec.ts`
- `messenger-chat-history.service.spec.ts`

## Liên quan

- Quota logic: `.claude/rules/chat-rate-limit.md`
- Webhook dedupe RAM/DB: `messenger.service.ts` → `isDuplicateMessageMid`
- Docs: `docs/chat-rate-limit-quota.md` §5.3, H7

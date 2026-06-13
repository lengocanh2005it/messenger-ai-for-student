---
alwaysApply: false
paths: src/modules/messenger/application/services/messenger-chat*
---

# Messenger chat queue & shared state (H7)

Chat tự do: debounce → LLM agent → Send API. Tích hợp `ChatRateLimitModule` tại flush.

## Hai chế độ queue

| Mode | Env | Debounce / history / mid dedupe |
|------|-----|----------------------------------|
| Local (POC 1 instance) | `CHAT_QUEUE_SHARED=false` | RAM trong process |
| Shared (≥2 pod) | `CHAT_QUEUE_SHARED=true` | PostgreSQL + cron poll |

## File chính

| File | Vai trò |
|------|---------|
| `messenger-chat-queue.service.ts` | Enqueue, debounce, flush, `processChatBatch`, reserve hook |
| `messenger-chat-history.service.ts` | Context LLM (RAM hoặc DB) |
| `messenger-chat-shared-config.service.ts` | `CHAT_QUEUE_SHARED`, TTL, stuck ms |
| `messenger-chat-queue-worker.service.ts` | Cron poll buffer (2s) + webhook dedupe cleanup |
| `infrastructure/persistence/messenger-chat-shared-state.repository.ts` | Buffer, history, webhook_seen |

Port: `MESSENGER_CHAT_SHARED_STATE_REPOSITORY` — bind trong `messenger.module.ts`.

## Bảng DB (H7 migration)

- `messenger_chat_queue_buffer` — debounce cross-pod
- `messenger_chat_history` — LLM turns
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

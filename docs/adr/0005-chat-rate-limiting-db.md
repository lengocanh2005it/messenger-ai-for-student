# Chat rate limiting via DB instead of Redis

FREE_FORM chat quota (daily usage + burst limit) is tracked via PostgreSQL tables (`chat_daily_usage`, `chat_idempotency`, `chat_quota_events`) rather than Redis counters. Reserve/refund/markCompleted are DB transactions.

## Rationale

- **POC simplicity**: Single-instance deployment. No distributed counter needed. PostgreSQL atomic operations (`UPDATE ... SET free_form_count = free_form_count + 1`) are sufficient.
- **Audit trail**: The `chat_quota_events` table records all state changes (reserved, released, denied). Redis only holds counters with no history.
- **Natural idempotency**: The `chat_idempotency` table with a unique constraint on message ID ensures each message is counted only once. Redis would need additional logic to achieve this.
- **Transaction safety**: Reserve + idempotency check in the same transaction. No race conditions between pods.
- **No Redis infrastructure**: The POC runs on a single pod; Redis is not yet needed. Migration is possible later (R3 phase).

## Alternatives considered

| Alternative | Reason for rejection |
|-------------|---------------------|
| Redis counters | Requires Redis infrastructure. No audit trail. Race conditions between pods without Lua scripts. |
| In-memory counters | Server crash loses all state. Not durable. |
| External rate limiting service (Upstash, etc.) | Vendor lock-in, additional cost, network latency. |
| Token bucket algorithm | More complex than needed for a daily quota. Better suited for real-time rate limiting. |

## Consequences

- Each chat request requires one DB round-trip for the reserve. If DB latency is high (>50ms), user experience is impacted.
- The burst counter currently uses postgres (default) but can be switched to memory or Redis (R3) when performance demands it.
- When scaling to multi-pod, the DB becomes a bottleneck. Migration to Redis counters (R3 phase) or a distributed rate limiter will be necessary.
- The `chat_quota_events` table will grow quickly. A retention policy is needed (currently there is no cleanup cron for events, only for `messenger_message_logs`).

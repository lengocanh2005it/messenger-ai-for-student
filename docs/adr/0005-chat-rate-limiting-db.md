# Chat rate limiting qua DB thay vì Redis

FREE_FORM chat quota (daily usage + burst limit) được track qua PostgreSQL tables (`chat_daily_usage`, `chat_idempotency`, `chat_quota_events`) thay vì Redis counters. Reserve/refund/markCompleted là DB transactions.

## Lý do

- **POC simplicity**: Single-instance deployment. Không cần distributed counter. PostgreSQL atomic operations (`UPDATE ... SET free_form_count = free_form_count + 1`) đủ dùng.
- **Audit trail**: `chat_quota_events` table ghi lại mọi state changes (reserved, released, denied). Redis chỉ giữ counter, không có history.
- **Idempotency tự nhiên**: `chat_idempotency` table với unique constraint trên message ID đảm bảo mỗi tin nhắn chỉ đếm một lần. Redis cần thêm logic để achieve điều này.
- **Transaction safety**: Reserve + idempotency check trong cùng transaction. Không race condition giữa pods.
- **Không cần Redis infrastructure**: POC chạy single pod, chưa cần Redis. Có thể migrate sau (R3 phase).

## Phương án đã loại

| Phương án | Lý do loại |
|-----------|-----------|
| Redis counters | Cần Redis infrastructure. Không có audit trail. Race conditions giữa pods nếu không dùng Lua scripts. |
| In-memory counters | Server crash mất hết state. Không durable. |
| Rate limiting service外部 (Upstash, etc.) | Vendor lock-in, thêm chi phí, network latency. |
| Token bucket algorithm | Phức tạp hơn mức cần cho daily quota. Phù hợp hơn cho real-time rate limiting. |

## Hậu quả

- Mỗi chat request cần 1 DB round-trip cho reserve. Nếu DB latency cao (>50ms), user experience bị ảnh hưởng.
- Burst counter hiện dùng postgres (default) nhưng có thể chuyển sang memory hoặc Redis (R3) khi cần performance.
- Khi scale multi-pod, DB become bottleneck. Cần migrate sang Redis counters (R3 phase) hoặc distributed rate limiter.
- `chat_quota_events` table sẽ lớn nhanh. Cần retention policy (hiện tại chưa có cleanup cron cho events, chỉ có cho `messenger_message_logs`).

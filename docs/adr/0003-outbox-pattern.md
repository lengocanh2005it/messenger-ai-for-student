# Outbox pattern cho study_reminder_jobs và report_send_jobs

Study reminders và report sends dùng outbox pattern: ghi job row vào `study_reminder_jobs` / `report_send_jobs` trước, rồi xử lý bất đồng bộ bằng dispatch loop. Không dùng message queue (Bull, Redis, SQS).

## Lý do

- **Durability**: Job được ghi vào PostgreSQL trước khi xử lý. Nếu server crash giữa chừng, job vẫn còn trong DB và được retry khi server restart.
- **Đơn giản cho POC**: Single-instance, không cần distributed queue. Outbox trong DB đủ dùng.
- **Idempotency tự nhiên**: `sessionKey` unique constraint trên `study_reminder_jobs` đảm bảo sync nhiều lần không tạo duplicate jobs.
- **Debug dễ**: Query trực tiếp DB để xem jobs, trạng thái, lịch sử. Scripts debug (`npm run study-reminder:jobs`) đọc trực tiếp từ DB.
- **Không cần thêm infrastructure**: Không cần Redis hay message broker cho POC stage.

## Phương án đã loại

| Phương án | Lý do loại |
|-----------|-----------|
| Bull queue (Redis) | Cần Redis infrastructure. Phức tạp hơn POC cần. Có thể reconsider khi scale. |
| SQS (AWS) | Vendor lock-in, thêm chi phí, cần AWS account. |
| In-memory queue | Không durable — server crash mất hết jobs. |
| Cron polling DB trực tiếp | Không có transaction safety — có thể poll cùng lúc 2 instances. Outbox + claim table giải quyết. |

## Hậu quả

- Dispatch loop phải poll DB địnhinterval (adaptive poll S2). Không real-time như push-based queue.
- Cần careful transaction: outbox row và business state phải ghi trong cùng transaction.
- Khi scale multi-pod, cần leader election (`scheduled_report_claims` + advisory lock) để chỉ một pod dispatch. Hiện tại đã implement.
- Nếu throughput cao (>1000 jobs/giờ), sẽ cần chuyển sang dedicated message queue.

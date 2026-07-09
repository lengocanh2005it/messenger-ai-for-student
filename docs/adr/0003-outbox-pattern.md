# Outbox pattern for study_reminder_jobs and report_send_jobs

Study reminders and report sends use the outbox pattern: a job row is written to `study_reminder_jobs` / `report_send_jobs` first, then processed asynchronously via a dispatch loop. No message queue (Bull, Redis, SQS) is used.

## Rationale

- **Durability**: Jobs are written to PostgreSQL before processing. If the server crashes mid-operation, the job remains in the DB and is retried when the server restarts.
- **Simple for POC**: Single-instance deployment; no distributed queue needed. An outbox table in the DB is sufficient.
- **Natural idempotency**: The `sessionKey` unique constraint on `study_reminder_jobs` ensures that syncing multiple times does not create duplicate jobs.
- **Easy debugging**: Query the DB directly to view jobs, their status, and history. Debug scripts (`npm run study-reminder:jobs`) read directly from the DB.
- **No additional infrastructure**: No Redis or message broker required at the POC stage.

## Alternatives considered

| Alternative | Reason for rejection |
|-------------|---------------------|
| Bull queue (Redis) | Requires Redis infrastructure. More complex than a POC needs. Can be reconsidered when scaling. |
| SQS (AWS) | Vendor lock-in, additional cost, requires an AWS account. |
| In-memory queue | Not durable — server crash loses all jobs. |
| Direct DB polling via cron | No transaction safety — two instances could poll simultaneously. Outbox + claim table solves this. |

## Consequences

- The dispatch loop must poll the DB at regular intervals (adaptive poll S2). It is not as real-time as a push-based queue.
- Careful transaction handling is required: the outbox row and business state must be written in the same transaction.
- When scaling to multi-pod, leader election (`scheduled_report_claims` + advisory lock) is needed so that only one pod dispatches. This is already implemented.
- If throughput becomes high (>1000 jobs/hour), migration to a dedicated message queue will be necessary.

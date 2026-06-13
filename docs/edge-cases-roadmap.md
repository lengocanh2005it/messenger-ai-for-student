# Edge cases & gap — roadmap khắc phục

Tài liệu ghi **điểm yếu / chưa xử lý** của POC `demo_send_message_fb` (toàn bộ chức năng, không chỉ rate limit) và **cách khắc phục** theo **phase nhỏ** — merge PR độc lập.

**Trạng thái baseline:** Chat rate limit **V1 + H1–H7 ✓**. Các mục dưới là gap còn lại hoặc cải thiện tùy quy mô.

Liên quan: [project-overview.md](./project-overview.md), [study-session-reminder.md](./study-session-reminder.md), [chat-rate-limit-quota.md](./chat-rate-limit-quota.md), [AGENTS.md](../AGENTS.md) (bảng Integration gaps).

---

## Bảng phase (tóm tắt)

| Phase | Tên | Effort ước lượng | Ưu tiên POC 1 instance |
|-------|-----|------------------|-------------------------|
| **Q1** ✓ | QA E2E 4 luồng | 0.5 ngày | **Cao** — trước go-live |
| **L1** ✓ | Tin không phải text → reply hướng dẫn | 0.5 ngày | Trung bình |
| **L2** ✓ | Policy Send 24h cho báo cáo / nhắc lịch | 0.5–1 ngày | Trung bình |
| **L3** | Mapping đổi `user_id` (PSID giữ nguyên) | 1 ngày | Thấp (hiếm) |
| **R1** ✓ | Báo cáo: empty score → tin thân thiện | 0.5 ngày | Trung bình |
| **R2** ✓ | Báo cáo: chia bubble dài | 0.5 ngày | Thấp |
| **R3** ✓ | Báo cáo: retry / dead-letter khi API lỗi | 1–1.5 ngày | Trung bình |
| **R4** | Báo cáo 08:00: idempotency / cron leader (≥2 pod) | 1 ngày | Chỉ khi scale |
| **S0** ✓ | Wispace wire `study-calendar/sync` | 0.5 ngày (Wispace) | **Cao** — tích hợp |
| **S1** ✓ | Alert ops job `failed` / stuck nhắc lịch | 0.5 ngày | Trung bình |
| **S2** | Adaptive dispatch poll (scale) | 1–2 ngày | Khi outbox lớn |
| **C1** | Tier quota theo gói Wispace | 2+ ngày | Product sau |
| **C2** | Event store / billing LLM | 2+ ngày | Product sau |
| **I1** ✓ | Alert / grep `CHAT_QUOTA_*` + runbook | 0.5 ngày | Trung bình |
| **I2** | Monitor tổng hợp (Slack/webhook ops) | 1 ngày | Khi có user thật |
| **I3** | Bỏ fallback DB `UserCalendars` | 1 ngày | Khi API ổn định |

**Thứ tự khuyến nghị:** ~~Q1/S0/I1/S1/L1/R1/L2/R2/R3~~ (✓) → L3/R4 + `CHAT_QUEUE_SHARED` khi scale → phần còn lại theo feedback user.

```mermaid
flowchart LR
  Q1[QA E2E] --> S0[Wispace sync]
  S0 --> I1[Ops alerts]
  I1 --> L1[R1 UX gaps]
  L1 --> Scale[Scale pod]
  Scale --> R4[R4 cron leader]
  Scale --> H7[CHAT_QUEUE_SHARED]
```

---

## 1. Liên kết Messenger ↔ WISPACE

### Đã có ✓

| Hành vi | Code / ghi chú |
|---------|-----------------|
| Opt-in / `referral.ref` | `MessengerService` → `user_messenger_mappings` |
| Đăng ký báo cáo trùng topic/cadence | `SUBSCRIPTION_ALREADY_ACTIVE` |
| Postback dedupe 15s | `isDuplicatePostback` |
| Chat chưa link | `MISSING_USER_REF` |
| Tin **không phải text** (sticker, ảnh, file) | **L1** — `UNSUPPORTED_MESSAGE_TYPE`, `isUnsupportedUserMessage` |
| User **chặn bot** / **Meta 24h window** | **L2** ✓ — `*_MESSENGER_24H` log, nhắc lịch terminal fail, cron báo cáo skip |

### Gap & khắc phục

| Gap | Ảnh hưởng | Khắc phục | Phase |
|-----|-----------|-----------|-------|
| User đổi tài khoản WISPACE, **giữ PSID** | Mapping cũ `user_id` → dữ liệu/API sai user | Ops: script re-link hoặc API `POST` cập nhật mapping theo `ref` mới; product: khi `ref` khác `user_id` hiện tại → confirm + upsert | **L3** |
| Webhook Meta retry; lỗi 1 event | Event khác vẫn xử lý (đúng); event lỗi mất | Log `failures[]` đủ; optional bảng `webhook_dead_letter` + replay script ops | **L3** (optional) |

---

## 2. Báo cáo học tập AI

### Đã có ✓

| Hành vi | Ghi chú |
|---------|---------|
| Cron 08:00, cửa sổ 2–3 ngày trước thi | `ReportScheduleService` |
| Skip đã gửi hôm nay | `hasSentScheduledReportToday` |
| Lỗi từng user không chặn batch | `report-cron.service` try/catch per mapping |
| Thiếu OpenAI key | Fallback template |
| Menu + ops `send-reports` | `forceSend` bypass window |
| **TaskScoreAverage rỗng** | **R1** — `StudentReportNoScoreDataError` → tin hướng dẫn làm bài, không throw |
| **Báo cáo bubble dài** | **R2** ✓ — `sendTextBubblesViaPsid` + `CHAT_MAX_BUBBLES` |
| **Wispace API lỗi** | **R3** ✓ — 5xx defer/retry message; 4xx tin “chưa đủ dữ liệu” |
| **Meta 24h proactive** | **L2** ✓ — `*_MESSENGER_24H` log; cron `windowClosed` / `deferred` |

### Gap & khắc phục

| Gap | Ảnh hưởng | Khắc phục | Phase |
|-----|-----------|-----------|-------|
| Không idempotency proactive | Hiếm duplicate; cron 08:00 có `hasSentScheduledReportToday` | Đủ cho 1 pod; multi-pod: unique `(psid, report_date)` hoặc transaction trước Send | **R4** |
| Cron 08:00 **mọi pod** | ≥2 instance → risk 2 báo cáo/ngày | `CRON_LEADER_ENABLED` + 1 pod leader, hoặc advisory lock PostgreSQL trong `sendScheduledReports` | **R4** |

---

## 3. Nhắc lịch học

### Đã có ✓

Outbox `study_reminder_jobs`, retry/backoff, reset stuck `processing`, upsert đổi giờ, cancel stale, preview menu, LLM fallback, `claimJob` multi-instance.

| Hành vi | Ghi chú |
|---------|---------|
| **Wispace wire sync** | **S0** ✓ — `POST /messenger/study-calendar/sync` sau POST/DELETE `UserCalendar` |

### Gap & khắc phục

| Gap | Ảnh hưởng | Khắc phục | Phase |
|-----|-----------|-----------|-------|
| Dispatch cron **1 phút** | Nhắc muộn ≤1 phút | Chấp nhận POC; hoặc giảm interval khi có job due trong 5 phút | **S2** |
| Horizon **14 ngày** | Buổi xa chưa có job | Document; tăng `STUDY_REMINDER_SYNC_HORIZON_HOURS` nếu product cần | Config / doc |
| User chưa link PSID | Không nhắc | By design — optional kênh khác (email) ngoài scope | — |
| Job **failed** hết retry | Học viên không nhắc, ops không biết | **S1** ✓ — `study-reminder:jobs --failed`, cron `OPS_HEALTH_ALERT`, `npm run ops:health` | Done |
| Outbox **phình** + poll 1 phút | DB tải khi scale | Cleanup đã có; adaptive poll + index `remind_at` — [§11.6](./study-session-reminder.md) | **S2** |
| 24h window nhắc lịch | Send fail | **L2** ✓ — `STUDY_SESSION_REMINDER_*_MESSENGER_24H`, terminal fail | Done |

---

## 4. Chat AI + agent

### Đã có ✓

Rate limit V1 + **H1–H7**, agent tools, history RAM/DB, delivery semantics H4.

### Gap & khắc phục

| Gap | Ảnh hưởng | Khắc phục | Phase |
|-----|-----------|-----------|-------|
| Tier theo gói Wispace | Mọi user cùng `CHAT_FREE_FORM_DAILY_LIMIT` | Phase 7: limit theo `user_id` / API gói — [§5.8](./chat-rate-limit-quota.md) | **C1** |
| Event store / billing | Khó audit chi phí LLM theo tháng | `messenger_chat_events` + projection — Phase 8 | **C2** |
| Tool đổi lịch qua chat | Phụ thuộc đã link + sync Wispace | Đã có tool; harden error message khi API lỗi | — |

---

## 5. Hạ tầng & vận hành

| Edge case | Hiện trạng | Khắc phục | Phase |
|-----------|------------|-----------|-------|
| **1 instance POC** | Phù hợp | Giữ `CHAT_QUEUE_SHARED=false` | — |
| **≥2 pod chat** | Queue/history tách pod | `CHAT_QUEUE_SHARED=true` + migration — H7 ✓ | Done (bật env) |
| **≥2 pod cron báo cáo** | Risk gửi trùng 08:00 | **R4** cron leader / DB lock | **R4** |
| **≥2 pod cron nhắc** | `claimJob` ✓ | Theo dõi; **S2** nếu DB chậm | **S2** |
| Monitor / alert | Log + scripts | **I1** ✓ runbook + `ops:health`; **S1** ✓ failed/stuck jobs; **I2** webhook Slack | **I2** |
| Wispace **schema** đổi | Fallback DB `UserCalendars` | API-only khi ổn định — **I3** | **I3** |

### I1 — Ops alert nhẹ (không cần Prometheus) ✓

| Việc | Done khi |
|------|----------|
| Runbook grep `CHAT_QUOTA_DENY`, `REFUND`, `RECOVERED` | `project-overview.md` §12 |
| `chat-quota:status --ops` + `study-reminder:jobs --failed` / `--stuck` | Script ops |
| Cron 09:00 ICT + `npm run ops:health` | `OPS_HEALTH_ALERT` trong app log |

### S1 — Nhắc lịch failed / stuck ✓

| Việc | Done khi |
|------|----------|
| `npm run study-reminder:jobs -- --failed` | Terminal failed (retry hết) |
| `npm run study-reminder:jobs -- --stuck` | Processing > 10 phút |
| `npm run ops:health` / cron nội bộ | `OPS_HEALTH_ALERT` khi có spike |

---

## Q1 — Checklist QA E2E (không cần code) ✓

Đã chạy manual test trước go-live (Messenger + `.env` prod).

### Q1.1 Link

- [x] Mở `m.me` có `ref={userId}` từ WISPACE
- [x] Kiểm tra `user_messenger_mappings` có `psid` + `user_id`
- [x] Menu persistent hiển thị (đã `profile/setup`)

### Q1.2 Báo cáo

- [x] Postback “Xem tiến độ” → nhận tin, log `LEARNING_PROGRESS`
- [x] (Tuỳ chọn) User trong cửa sổ 2–3 ngày trước thi → cron hoặc `POST /messenger/send-reports`

### Q1.3 Nhắc lịch

- [x] Có buổi trong `UserCalendar` trong horizon
- [x] `npm run study-reminder:jobs` thấy job `pending` → `remind_at` đúng
- [x] Sau sync (API hoặc cron) → đến giờ nhận tin nhắc
- [x] Postback preview “Nhắc lịch sắp tới” hoạt động

### Q1.4 Chat quota

- [x] `CHAT_RATE_LIMIT_ENABLED=true`
- [x] Nhắn text → bot reply, `chat-quota:status` tăng `used`
- [x] Burst / hết ngày → `CHAT_QUOTA_DENIED`
- [x] Menu postback **không** tăng quota

```bash
npm run chat-quota:status -- --psid=<PSID>
npm run study-reminder:jobs
```

---

## Cập nhật tài liệu khi đóng phase

| Khi merge phase | Cập nhật |
|-----------------|----------|
| Bất kỳ | Tick ✓ trong bảng phase đầu file này |
| S0 | `AGENTS.md` Integration gaps, `study-session-reminder.md` |
| R4, H7 scale | `project-overview.md` §10 |
| L1, R1, L2, R2, R3, … | Mục tương ứng trong file này → chuyển sang “Đã có” ✓ |

---

*POC ưu tiên ship — không implement hết roadmap; chọn phase theo feedback user thật và quy mô deploy.*

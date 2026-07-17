# WISPACE BOTS

POC NestJS Turborepo monorepo cho bot học viên IELTS — báo cáo AI, nhắc lịch học, chat AI rate limit. Hiện có `apps/messenger-bot` (đầy đủ), `apps/discord-bot` (placeholder), `apps/zalo-bot` (placeholder), với shared packages: `llm-agent`, `chat-metering`, `wispace-client`, `chat-history`, `student-report`, `chat-queue-core`, `study-reminder-core`.

## Language

### Platform & Identity

**WISPACE**:
Nền tảng học IELTS Writing bên ngoài mà các bot tích hợp qua HTTP API.
_Avoid_: backend, Wispace API (khi nói về sản phẩm itself)

**PSID**:
Page-Scoped ID — identifier Facebook cấp cho mỗi Messenger user, riêng biệt theo Page. Dùng làm `externalUserId` trên nền tảng Messenger.
_Avoid_: user ID, sender ID

**externalUserId**:
Identifier của user theo nền tảng (`psid` cho Messenger, Discord user ID, Zalo UID). Dùng trong các cross-platform packages.
_Avoid_: platform user ID, bot user ID

**userId**:
Identifier nội bộ số của WISPACE (integer). Có được sau khi link Messenger account qua `ref` hoặc token verify.
_Avoid_: user ID không rõ nghĩa — luôn ghi "WISPACE userId"

**ref**:
Query parameter trong link `m.me`. Chứa WISPACE `userId` dưới dạng string. Được parse bởi `parseUserIdFromRef()`.
_Avoid_: reference

**m.me**:
Domain link ngắn của Facebook cho Messenger. `m.me/{page}?ref={userId}&topic=...&cadence=...` là cách Wispace khởi tạo account-linking flow.
_Avoid_: Messenger link

**platform**:
String discriminator trên hầu hết entities và cross-package types (`'messenger'`, `'discord'`, `'zalo'`). Cho phép đa bot dùng chung database.
_Avoid_: channel, service

### Account Linking

**linking / link**:
Quá trình ghép nối PSID (Messenger) với WISPACE `userId`. Xảy ra khi user mở link `m.me` và webhook nhận `ref` parameter.
_Avoid_: registration, signup

**MessengerLinkContext**:
Context đã parse từ link `m.me`: `{ ref, topic, cadence, userId }`.
_Avoid_: link params, ref context

**NotificationCadence**:
Tần suất user muốn nhận thông báo: `'DAILY'`, `'WEEKLY'`, hoặc `'MONTHLY'`. Lưu trên mapping.
_Avoid_: frequency (field name là `cadence`)

**topic**:
Chủ đề cho thông báo (ví dụ `'IELTS'`, `'IELTS Writing'`). Lưu trên mapping.
_Avoid_: subject

**user_platform_mappings** (DB table):
Bảng mapping chính (entity: `UserPlatformMappingEntity`). Lưu `user_id`, `external_user_id`, `platform`, `cadence`, `topic`, `status`.
_Avoid_: user_messenger_mappings (đã migrate sang tên mới)

**ACTIVE / INACTIVE**:
Trạng thái mapping. Chỉ mapping `ACTIVE` mới nhận thông báo và được sync.
_Avoid_: enabled/disabled

**token link / token-only link**:
Chế độ link ưu tiên (`MESSENGER_LINK_MODE=token`). User verify qua `WISPACE_API_VERIFY_TOKEN_URL` với body `{token, value, platform}`. Ngăn relink (L4 constraint).
_Avoid_: ref-only linking

**allowRelink**:
Ops flag cho phép ghép nối lại PSID với WISPACE userId khác (xử lý L3).
_Avoid_: reassign, rebind

### Study Reminder

**study_reminder_jobs** (DB table):
Bảng outbox cho lịch nhắc học. Entity: `StudyReminderJobEntity`. Trạng thái: `pending` → `processing` → `sent` / `failed` / `cancelled`.
_Avoid_: reminder queue, notification jobs

**sessionKey**:
Key duy nhất cho một buổi học (từ UserCalendar record). Dùng làm idempotency key khi upsert jobs: `unique(platform, external_user_id, session_key)`.
_Avoid_: session ID (nó là composite key, không phải DB primary key)

**remindAt**:
Thời điểm gửi tin nhắn nhắc. Tính bằng `scheduledAt - STUDY_REMINDER_MINUTES_BEFORE`.
_Avoid_: sendAt, notifyAt

**scheduledAt**:
Thời gian thực sự bắt đầu buổi học, từ UserCalendar API.
_Avoid_: eventTime, startTime

**sync**:
Quá trình đọc UserCalendar từ Wispace API rồi upsert/hủy jobs trong `study_reminder_jobs`. Xảy ra: khi gọi API, cron 30 phút, khi khởi động server.
_Avoid_: refresh, reload

**dispatch**:
Quá trình lấy jobs `pending` có `remind_at <= now` rồi gửi tin nhắn nhắc qua LLM. Dùng adaptive polling.
_Avoid_: send, deliver

**adaptive poll (S2)**:
Chiến lược dispatch: poll interval thay đổi giữa 30s và 3.5 phút tùy khoảng cách đến nhắc tiếp theo (`STUDY_REMINDER_POLL_*` env vars).
_Avoid_: cron dispatch (nó là adaptive loop, không phải cron cố định)

**horizon**:
Phạm vi tìm kiếm buổi học sắp tới khi sync (`STUDY_REMINDER_SYNC_HORIZON_HOURS`, mặc định 14 ngày).
_Avoid_: window, lookahead

**rollover**:
Quá trình lúc 23:00 ICT buổi tối: dọn jobs `sent` rồi re-sync horizon cho ngày tiếp theo.
_Avoid_: nightly sync (rollover bao gồm cleanup trước khi re-sync)

**minLeadMinutes**:
Thời gian tối thiểu trước khi buổi học bắt đầu mà nhắc vẫn có thể gửi. Nếu `scheduledAt` gần hơn thì job bị hủy.
_Avoid_: lead time không rõ nghĩa

**UserCalendar** / **UserCalendarRecord**:
Resource từ Wispace API đại diện cho một buổi học đã lên lịch. Fields: `id`, `userId`, `eventDate`, `time`.
_Avoid_: calendar event

**NormalizedStudySession**:
Đại diện chuẩn hóa của buổi học: `{ sessionKey, scheduledAt, topic, durationMinutes }`. Tạo từ UserCalendar records.
_Avoid_: CalendarEvent, SessionRecord

### Student Report

**StudentCapacityInput**:
Dữ liệu gửi cho LLM để tạo báo cáo. Bao gồm `exam_date`, `target_band`, `task1_band`, `task2_band`, `total_essays_task1/2`, `days_until_exam`, v.v.
_Avoid_: report input, report data

**StudentCapacityReport**:
Output có cấu trúc từ LLM: `{ headline, streak, "tinh trang task 1", "tinh trang task 2" }`.
_Avoid_: AI report (đó là tin nhắn formatted user nhìn thấy)

**band / targetScore**:
Điểm IELTS (thang 0-9). `targetScore` là band goal. `task1_band` và `task2_band` là trung bình hiện tại của Task 1 và Task 2.
_Avoid_: score không rõ nghĩa — luôn ghi "band" hoặc "target band"

**Task 1 / Task 2**:
Các phần của bài thi IELTS Writing. Task 1 = mô tả biểu đồ; Task 2 = luận văn. Hệ thống theo dõi điểm và số bài tập theo task.
_Avoid_: task1/task2 trong văn bản không có context

**TaskScoreAverageRecord**:
Response từ Wispace API với điểm trung bình theo tiêu chí IELTS: `avgTaskAchievement`, `avgCoherenceCohesion`, `avgLexicalResource`, `avgGrammaticalRangeAccuracy`, cộng `currentStreak`, `highestStreak`, `totalPracticeTimeMinutes`.
_Avoid_: score record

**streak**:
Số ngày/tuần liên tiếp luyện tập. Là một phần của báo cáo.
_Avoid_: consecutive count

**examDate**:
Ngày thi IELTS đã lên lịch của user. Chi phối cửa sổ báo cáo (`WISPACE_REPORT_DAYS_BEFORE_EXAM_*`).
_Avoid_: test date

**report window / days before exam**:
Cửa sổ lịch (`2-3 ngày trước thi`) trong đó báo cáo tự động được gửi. Cấu hình qua `WISPACE_REPORT_DAYS_BEFORE_EXAM_MIN/MAX`.
_Avoid_: notification window

**report_send_jobs** (DB table):
Outbox để retry gửi báo cáo khi Wispace API lỗi 5xx. Entity: `ReportSendJobEntity`. Unique trên `(platform, external_user_id, exam_date)`.
_Avoid_: report queue

**scheduled_report_claims** (DB table):
Bảng claim cho multi-pod cron leader election trên job cron 08:00. Entity: `ScheduledReportClaimEntity`.
_Avoid_: report lock, cron claim

**fallback report**:
Báo cáo template xác định dùng khi OpenAI không khả dụng hoặc trả JSON không hợp lệ. Tạo bởi `buildFallbackReport()`.
_Avoid_: default report

### Chat Rate Limiting & Quota

**FREE_FORM**:
Loại tương tác chat bị rate limit: user gửi text tự do → bot trả lời qua LLM. Đây là bucket duy nhất có quota.
_Avoid_: free chat, open chat

**quota**:
Hạn mức sử dụng hàng ngày cho FREE_FORM interactions của user. Theo dõi theo `(platform, externalUserId, usageDate)`.
_Avoid_: limit (dùng cho burst limit), allowance

**chat_daily_usage** (DB table):
Bảng đếm sử dụng hàng ngày. Entity: `ChatDailyUsageEntity`. Mỗi user mỗi ngày một row với `free_form_count`.
_Avoid_: messenger_chat_daily_usage (tên cũ)

**freeFormCount**:
Số FREE_FORM interactions user đã dùng trong ngày. Tăng nguyên tử khi reserve.
_Avoid_: usage count, chat count

**reserve**:
Thao tác nguyên tử: (1) kiểm tra burst limit, (2) insert idempotency row trạng thái `reserved`, (3) tăng `freeFormCount`. Trả về `ChatQuotaCheckResult`.
_Avoid_: allocate, claim

**refund**:
Đảo ngược reservation khi LLM call hoặc Send API fail trước khi user nhận tin nhắn. Đổi trạng thái idempotency sang `refunded` và giảm counter.
_Avoid_: rollback, revert

**markCompleted**:
Đổi trạng thái idempotency từ `reserved` sang `completed` sau khi gửi tin nhắn thành công.
_Avoid_: finalize, commit

**chat_idempotency** (DB table):
Đảm bảo mỗi `message.mid` (hoặc platform message ID) chỉ được đếm một lần. Entity: `ChatIdempotencyEntity`. Trạng thái: `reserved`, `completed`, `refunded`.
_Avoid_: dedup table (deduplication là concern riêng — `CHAT_DEDUPE_STORE`)

**idempotencyKey**:
Platform-specific message identifier (`message.mid` Messenger, `message.id` Discord) dùng để chống đếm đôi.
_Avoid_: message ID — dùng `idempotencyKey` trong quota context

**burst**:
Rate limit ngắn hạn (theo phút) chống spam. Kiểm tra trước daily quota. Cấu hình qua `CHAT_BURST_PER_MINUTE`.
_Avoid_: spike limit, throttle

**ChatQuotaCheckResult**:
Kết quả kiểm tra quota: `{ allowed, used, limit, remaining, reason?, usageDate, quotaReserved? }`.
_Avoid_: quota response

**ChatQuotaDenyReason**:
Lý do quota bị từ chối: `'DAILY_LIMIT'`, `'BURST_LIMIT'`, `'NOT_LINKED'`, `'IDEMPOTENCY_CONFLICT'`.
_Avoid_: deny reason string

**stuck reserved**:
Idempotency row kẹt trạng thái `reserved` quá TTL (mặc định 10 phút). Được recover bởi `recoverStuckReservedSlots()` (H2 hardening).
_Avoid_: stale reservation

**whitelist**:
Danh sách PSID được miễn rate limit (`CHAT_RATE_LIMIT_WHITELIST_PSIDS`). Dùng cho QA/testing.
_Avoid_: allowlist

### Chat Queue & Debounce

**debounce**:
Cơ chế buffer tin nhắn nhanh của user rồi merge thành batch trước khi xử lý. Cấu hình qua `CHAT_DEBOUNCE_MS`.
_Avoid_: throttle, batch delay

**flush**:
Hành động xử lý batch debounce: merge text, gọi rate limit, gọi LLM, gửi reply. Xảy ra sau khi debounce window hết hạn.
_Avoid_: process, drain

**ChatQueueBatch**:
Batch tin nhắn đã merge cho một user: `{ externalUserId, texts[], context?, idempotencyKey? }`.
_Avoid_: message batch — luôn dùng `ChatQueueBatch`

**DebounceChatQueue**:
State machine debounce/merge per-user framework-agnostic (trong `packages/chat-queue-core`). Sở hữu buffering, coalescing, eviction. Chỉ dùng memory.
_Avoid_: chat queue — tên class là `DebounceChatQueue`

**pendingWhileProcessing**:
Tin nhắn đến trong khi queue đang flush batch. Chúng được buffer và flush sau khi batch hiện tại hoàn thành.
_Avoid_: queued messages

### Messenger-Specific

**postback**:
Tin nhắn button Messenger gửi predefined payload đến webhook. Dùng cho các hành động menu (ví dụ "Xem tien do", "Dang ky bao cao").
_Avoid_: button action, click event

**persistent menu**:
Menu luôn hiển thị ở cuối cuộc trò chuyện Messenger. Cấu hình qua `POST /messenger/profile/setup`.
_Avoid_: bot menu, main menu

**messaging window / 24h window**:
Quy tắc Meta: bot chỉ gửi tin nhắn `RESPONSE` trong 24 giờ kể từ tin nhắn cuối của user. Đây là lý do báo cáo dùng `register_exam_report_notifications` (để có `notification_messages_token` gửi proactive ngoài 24h).
_Avoid_: send window không nói rõ "24h"

**notification_messages_token**:
Token từ Messenger One-Time Notification API, cho phép bot gửi tin nhắn proactive ngoài 24h window. Dùng cho exam reports.
_Avoid_: proactive token, NTS token

**message.mid**:
Message identifier duy nhất của Meta. Dùng làm idempotency key cho quota reservation và webhook deduplication.
_Avoid_: message ID — dùng `message.mid` trong Messenger context

**webhook**:
HTTP endpoint (`POST /webhook`) nhận events từ Meta Messenger Platform. Xác thực qua `X-Hub-Signature-256`.
_Avoid_: callback, event receiver

**dead letter / webhook_dead_letters** (DB table):
Webhook events xử lý thất bại được lưu ở đây để replay sau. Entity: `WebhookDeadLetterEntity`. Trạng thái: `pending`, `replayed`, `abandoned`.
_Avoid_: failed webhook, dead queue

**messenger_message_logs** (DB table):
Audit log tất cả tin nhắn gửi/nhận. Entity: `MessageLogEntity`. Được dọn dẹp bởi cron (mặc định 90 ngày).
_Avoid_: message history (đó là `CHAT_HISTORY_STORE`)

**MessageSenderPort**:
Cross-module port token (`MESSAGE_SENDER`) để gửi tin nhắn. Triển khai bởi `MessengerOutboundService`. Dùng bởi `StudyReminderModule` để tránh circular dependency.
_Avoid_: inject `MessengerService` từ module khác — luôn dùng port

**routeWebhookEvent**:
Pure function phân loại webhook event thành `WebhookAction[]`. Nhận `(event, ctx?)`, trả về danh sách actions. Không side effect, không async, không phụ thuộc NestJS. Nằm trong `messenger-webhook.router.ts`.
_Avoid_: routeEvent, classifyEvent

**WebhookAction**:
Giá trị mô tả hành động cần thực hiện cho một webhook event. Các type: `link_user`, `enqueue_chat`, `send_text`, `register_report`, `send_report`, `send_reminder_preview`, `confirm_reschedule`, `cancel_reschedule`, `send_welcome`, `ignore`.
_Avoid_: action type không rõ nghĩa

**RouterContext**:
Context đã resolve trước khi gọi router: `{ isDuplicateMid?, isDuplicatePostback?, existingMapping?, linkContext?, linkAttemptStatus? }`. Giúp router đưa ra quyết định thuần túy (sync, không async).
_Avoid_: routing context, event context

### LLM

**LlmAgentService**:
Vòng lặp orchestration OpenAI function-calling framework-agnostic (trong `packages/llm-agent`). Quản lý tool rounds, history, grounding checks, prompt injection detection.
_Avoid_: chat service, AI service

**tool round**:
Một lần lặp của LLM function-calling loop. Agent có thể gọi nhiều tools mỗi user message, tối đa `maxToolRounds` (mặc định 6).
_Avoid_: iteration, loop count

**feature**:
String tag để phân loại LLM calls: `'FREE_FORM_CHAT'`, `'STUDENT_REPORT'`, `'STUDY_REMINDER'`. Dùng cho usage tracking và metrics.
_Avoid_: use case, purpose

**correlationId**:
Identifier duy nhất ghép LLM call với event kích hoạt (thường `message.mid` hoặc userId). Dùng cho tracing và usage telemetry.
_Avoid_: trace ID, request ID

**prompt injection**:
Cuộc tấn công khi text độc hại trong user messages hoặc tool results trick LLM. Được phát hiện bởi `detectPromptInjection()` và chặn trước khi gọi OpenAI.
_Avoid_: injection attack — dùng "prompt injection"

**grounding check**:
Xác minh LLM response thực sự grounded trong tool results (không hallucinate). Thực hiện bởi `checkLlmGrounding()`. Ghi warning nếu nghi ngờ.
_Avoid_: hallucination check

**sanitizeUntrustedTextForLlm**:
Hàm utility loại bỏ/escape nội dung potentially dangerous từ user hoặc Wispace data trước khi chèn vào prompts hoặc tool results.
_Avoid_: escape, encode — dùng "sanitize"

**system prompt / *.system.txt**:
Persona/instructions cơ sở load từ `src/shared/prompts/*.system.txt`. Được copy sang `dist/` khi build. Ba biến thể: `student-report`, `study-reminder`, `messenger-chat`.
_Avoid_: prompt file, AI instructions — dùng "system prompt"

**fallback reply**:
Canned response dùng khi OpenAI không khả dụng (thiếu API key hoặc lỗi). Không phải LLM-generated.
_Avoid_: default reply, error reply

### LLM Usage Tracking

**llm_usage_events** (DB table):
Ghi token usage mỗi LLM call. Entity: `LlmUsageEventEntity`. Fields: `feature`, `model`, `promptTokens`, `completionTokens`, `totalTokens`, `estimatedCostUsd`, `toolRound`.
_Avoid_: token log, usage log

**estimatedCostUsd**:
Chi phí ước tính bằng USD cho LLM call, tính từ token counts và model pricing (`LLM_COST_USD_PER_1M_*`). Không phải số tiền hóa đơn thực.
_Avoid_: cost không có "estimated"

**fleet**:
Tất cả các instances của bot application cộng lại. "Fleet summary" = tổng hợp usage trên tất cả pods. Truy cập qua `GET /messenger/ops/llm-usage/fleet`.
_Avoid_: cluster, deployment

### LLM Safety

**llm_safety_events** (DB table):
Ghi các sự kiện liên quan đến an toàn (grounding warnings, prompt injection blocks). Entity: `LlmSafetyEventEntity`.
_Avoid_: safety log, security events

**grounding warning**:
Sự kiện ghi khi LLM response có vẻ hallucinate (không grounded trong tool results). Chứa `reason`, `userTextPreview`, `assistantTextPreview`, `toolNamesUsed`.
_Avoid_: hallucination event

**redact**:
Quá trình thay thế history entries suspicious bằng `'[redacted]'` trước khi gửi cho OpenAI.
_Avoid_: censor, block

### Ops & Monitoring

**ops**:
Operations endpoints và scripts. Được bảo vệ bởi `InternalApiKeyGuard`. Bao gồm sync, send-reports, profile/setup, health checks, quota status.
_Avoid_: admin, management

**INTERNAL_API_KEY**:
Shared secret xác thực ops HTTP endpoints. Gửi qua header `X-Internal-Api-Key` hoặc `Authorization: Bearer`.
_Avoid_: admin key, service key

**H1-H7**:
Các item hardening cho chat rate limiting. H1=bật enforcement, H2=recover stuck, H3=hard cap trong transaction, H4=send semantics, H5=abuse caps, H6=retention/logs, H7=shared queue.
_Avoid_: hardening phase — đây là các item đánh số cụ thể

**R0-R5**:
Các phase tích hợp Redis. R0=kết nối cơ bản, R1=chat history, R2=webhook dedupe, R3=burst counter, R4=chat queue, R5=user display cache.
_Avoid_: redis phase chung chung

### Database & Entities

**ai_chat_bot_db**:
Database PostgreSQL dedicated cho bot POC. Trước đây là `writing_ai_hub_db`.
_Avoid_: bot database, main DB

**users** / **"Users"** (view):
Bảng cache + view trên `ai_chat_bot_db` cho display name và exam date của user. Entity: `UserEntity`. Chỉ chứa user có mapping Messenger active.
_Avoid_: user table

**DisplayName**:
Display name của user từ bảng `users` / view `"Users"`. Fallback về `'Chao ban nha'` nếu null. Dùng trong LLM prompts để cá nhân hóa.
_Avoid_: name, fullName

**chat_quota_events** (DB table):
Bảng event-sourcing cho quota state changes. Entity: `ChatQuotaEventEntity`. Events: `CHAT_QUOTA_RESERVED`, `CHAT_QUOTA_RELEASED`, `CHAT_QUOTA_DENIED`.
_Avoid_: quota log, quota audit

**claim table**:
Viết tắt của `scheduled_report_claims` — dùng trong leader election pattern.
_Avoid_: lock table

**advisory lock**:
PostgreSQL advisory lock dùng cùng claim table cho cron leader election.
_Avoid_: database lock — cụ thể là advisory lock

### Wispace API

**UserCalendar API**:
Wispace API endpoint đọc buổi học của user. Xác thực qua header `x-psid`. Trả về `UserCalendarRecord[]`.
_Avoid_: calendar API không có "User" prefix

**User/goals API**:
Wispace API endpoint đọc target score và exam date. Trả về `UserGoalsRecord`.
_Avoid_: goals API không có "User/" prefix

**TaskScoreAverage API**:
Wispace API endpoint đọc điểm IELTS writing trung bình. Trả về `TaskScoreAverageRecord`.
_Avoid_: scores API không có "TaskScoreAverage" prefix

**x-psid**:
HTTP header gửi cho Wispace API để nhận diện user. Là PSID của Messenger user.
_Avoid_: user header, auth header

**X-Internal-Key**:
HTTP header xác thực Wispace internal API. Map với env var `WISPACE_INTERNAL_KEY`.
_Avoid_: internal auth, service key

### Architecture

**Clean Architecture**:
Mẫu 4 tầng: `domain` (pure types/interfaces) → `application` (services/use cases) ← `infrastructure` (TypeORM, HTTP clients) → `presentation` (controllers).
_Avoid_: hexagonal architecture, onion architecture

**port**:
DI token (Symbol + interface) cho cross-module communication. Ví dụ: `MESSAGE_SENDER`, `MESSENGER_REPOSITORY`, `MESSENGER_MAPPING_READER`.
_Avoid_: interface một mình — port cụ thể là DI token pair

**GoalsDataPort**:
Port cho việc lấy dữ liệu goals của học viên từ WISPACE API. Method: `getUserGoals(psid)`.
_Avoid_: UserGoalsApiService (đó là adapter implementation)

**ReportPort**:
Port cho việc tạo báo cáo học tập qua LLM. Method: `generateReport(psid)`.
_Avoid_: StudentReportService (đó là adapter implementation)

**StudyDataPort**:
Port cho việc truy xuất dữ liệu lịch học và nhắc lịch. Methods: `getUpcomingSessions`, `getNextUpcomingSession`, `generateReminderBundleForSession`, `listCalendarEntries`, `getOutboxSettings`, `formatScheduledTimeLabel`.
_Avoid_: StudyReminderService, StudyCalendarCommandService (đó là adapter implementations)

**adapter**:
Implementation của port, bridge giữa domain interface và infrastructure service. Ví dụ: `GoalsDataAdapter` wraps `UserGoalsApiService`.
_Avoid_: implementation, service implementation

**outbox pattern**:
Mẫu dùng cho `study_reminder_jobs` và `report_send_jobs`: ghi job row trước, rồi xử lý bất đồng bộ. Cung cấp durability và retry.
_Avoid_: queue pattern, task queue

**Turborepo monorepo**:
Cấu trúc dự án: `apps/` (Messenger, Discord, Zalo bots) + `packages/` (shared code). Build bằng Turborepo.
_Avoid_: monorepo không có "Turborepo"

### Naming Conventions

| Dùng | Tránh | Lý do |
|------|-------|-------|
| `externalUserId` | `platformUserId`, `botUserId` | Tên chuẩn cross-platform |
| `psid` | `senderId`, `facebookId` | Khớp Meta terminology |
| `userId` | `wispaceId`, `internalId` | ID nội bộ WISPACE, luôn numeric |
| `sessionKey` | `sessionId`, `calendarId` | Composite key, không phải DB PK |
| `remindAt` | `sendAt`, `notifyAt` | Domain-specific: khi nào nhắc |
| `scheduledAt` | `startTime`, `eventTime` | Khớp UserCalendar API field |
| `quota` | `limit`, `allowance` | Phân biệt daily cap với burst limit |
| `reserve` / `refund` | `allocate` / `rollback` | Financial metaphor domain-specific |
| `flush` | `process`, `drain` | Cụ thể cho debounce queue |
| `sync` | `refresh`, `reload` | Cụ thể cho UserCalendar → jobs pipeline |
| `dispatch` | `send`, `deliver` | Cụ thể cho job → message pipeline |
| `feature` | `useCase`, `purpose` | LLM usage categorization tag |
| `correlationId` | `traceId`, `requestId` | Ghép LLM calls với event kích hoạt |
| `band` | `score`, `grade` | Thuật ngữ scoring IELTS |
| `examDate` | `testDate` | Khớp UserGoals API field |
| `cadence` | `frequency` | Khớp code và type names |
| `postback` | `buttonClick` | Messenger platform terminology |
| `dead letter` | `failed queue` | Standard messaging pattern |

# Clean Architecture — wispace-bots (Turborepo monorepo)

Repo dùng **feature modules + 4 tầng** theo chuẩn NestJS Clean Architecture (tham khảo [clean-nestjs-cli](https://github.com/jheisonnovak/clean-nestjs-cli), [NestJS-DDD-DevOps](https://andrea-acampora.github.io/nestjs-ddd-devops/)), trong `apps/messenger-bot/src/`. Đường dẫn dưới đây đều tương đối so với `apps/messenger-bot/src/` trừ khi ghi rõ khác.

## Ranh giới monorepo: `packages/llm-agent`

`packages/llm-agent` (`@wispace/llm-agent`) là package **framework-agnostic** dùng chung cho mọi bot (Messenger, Discord, Zalo) — chứa orchestration LLM function-calling (`LlmAgentService`), tool schema (`AGENT_TOOLS`), safety utils (prompt injection, grounding, OpenAI error), và text/scope utils domain WISPACE.

- **Không** import NestJS/TypeORM/Express trong `packages/llm-agent` — chỉ dependency `openai`.
- **Không** đặt business logic gọi Wispace API / DB trong package này — đó là tool handler (`ToolExecutorPort`), sống trong từng app (`apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent-tools.service.ts`).
- Mỗi app implement các port (`LlmExecutionPort`, `LlmUsageRecorderPort`, `LlmSafetyEventPort`, `AgentMetricsPort`, `ToolExecutorPort<T>`) bằng service NestJS thật, rồi gọi `new LlmAgentService(config, ports)` — xem `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` làm ví dụ adapter mỏng.
- Sửa package → phải rebuild + test cả app phụ thuộc (`npx turbo run build test --filter=@wispace/messenger-bot...`).

## Ranh giới monorepo: `packages/chat-metering`

`packages/chat-metering` (`@wispace/chat-metering`) là package framework-agnostic thứ hai, dùng chung quota/rate-limit chat (`chat_daily_usage`, `chat_idempotency`) + LLM usage/safety event tracking (`llm_usage_events`, `llm_safety_events`) — cả 4 bảng đã generalize `(platform, external_user_id)` từ Phase 2, `platform` truyền vào qua constructor thay vì hardcode.

- **Không** import NestJS trong package — chỉ dependency `typeorm` (dùng thẳng `Repository<T>`/`EntityManager`, không qua `@nestjs/typeorm` decorator). Mỗi app tự đăng ký entity qua `TypeOrmModule.forFeature([...])` rồi truyền `Repository<T>` vào constructor của core class (`ChatRateLimitCore`, `LlmUsageRecorderCore`, `LlmSafetyCore`) — same pattern như app implement port của `@wispace/llm-agent`.
- **Không di chuyển** vào package: whitelist/hint UX, quota-event audit table (`chat_quota_events`), stuck-reserved recovery cron, ops CLI scripts, BullMQ queue wiring, Redis burst counter, `MetricsService`/prom-client — các phần này ở lại từng app (hiện chỉ `apps/messenger-bot` có đủ, `apps/discord-bot` dùng bản rút gọn: `MemoryBurstCounter` + `DirectUsageWriter`, không BullMQ).
- `apps/messenger-bot`'s `ChatRateLimitRepository`/`LlmUsageRepository`/`LlmSafetyEventRepository` (infrastructure layer) là **thin wrapper** quanh package core (platform='messenger') — giữ nguyên `*RepositoryPort` interface + toàn bộ consumer không đổi. Method ops-only (`incrementDailyUsage`, `countStuckReserved`, ...) không có trong package, ở lại wrapper.
- `apps/discord-bot` dùng cùng entity/core class, platform='discord' — xem `apps/discord-bot/src/modules/chat-metering/`.
- Sửa package → rebuild + test cả 2 app (`npx turbo run build test --filter=@wispace/messenger-bot... --filter=@wispace/discord-bot...`).

## Ranh giới monorepo: `packages/wispace-client`

`packages/wispace-client` (`@wispace/wispace-client`) là package framework-agnostic thứ ba — HTTP client gọi Wispace API (User/goals, TaskScoreAverage, UserCalendar) + retry/error (`withRetry`, `WispaceApiError`) + date/timezone utils (`study-calendar.utils.ts`), dùng chung Messenger + Discord.

- **Không** import NestJS — chỉ dùng `fetch` thuần. App tự đọc `ConfigService` (URL, `WISPACE_INTERNAL_KEY`, retry settings) rồi truyền `WispaceApiClientConfig` vào constructor của client (`UserGoalsApiClient`, `TaskScoreAverageApiClient`, `UserCalendarApiClient`, `UserCalendarScheduleClient`).
- Header xác định học viên tổng quát hoá qua `buildWispaceHeaders(idHeader, externalId, internalKey)` — `idHeader` ∈ `x-psid` \| `x-discordid` \| `x-zaloid` (WISPACE API đã hỗ trợ cả 3, xác nhận từ user — không cần đổi gì bên WISPACE, chỉ gửi đúng header cho platform).
- **Không di chuyển** vào package: business logic report-generation (`StudentReportService`'s LLM call + capacity mapping), reschedule confirmation UI (Messenger postback button — `MessengerRescheduleConfirmationService`), notification-window subscription (`register_exam_report_notifications`) — các phần này đặc thù platform, ở lại từng app.
- `apps/messenger-bot`'s `UserGoalsApiService`/`TaskScoreAverageApiService`/`UserCalendarApiService`/`UserCalendarScheduleService` là **thin wrapper** quanh package client (idHeader='x-psid') — giữ nguyên public API, report-specific mapping (`mapToCapacityInput`) vẫn ở lại wrapper.
- `apps/discord-bot` dùng `modules/wispace/` (`WispaceGoalsService`, `WispaceCalendarService`, idHeader='x-discordid') để wire tool handlers thật trong `DiscordAgentToolsService`.
- Sửa package → rebuild + test cả 2 app (`npx turbo run build test --filter=@wispace/messenger-bot... --filter=@wispace/discord-bot... --filter=@wispace/wispace-client...`).

## Ranh giới monorepo: `packages/chat-history`

`packages/chat-history` (`@wispace/chat-history`) là package framework-agnostic thứ tư — `MemoryChatHistoryStore` (in-memory, TTL + turn cap) + `ChatHistoryStorePort`/`ChatHistoryMessage` dùng chung mọi bot.

- **Không** import NestJS trong package — plain class, constructor nhận `{ ttlMs, maxMessages }`.
- App tự quyết định có bọc `MemoryChatHistoryStore` sau một backend phân tán hay không: `apps/messenger-bot`'s `MemoryChatHistoryStore` (infrastructure, Nest `@Injectable`) là **thin wrapper** quanh package core, đọc TTL/maxMessages từ `MessengerChatSharedConfigService`; `ChatHistoryStoreResolver` vẫn chọn Redis khi `CHAT_HISTORY_STORE=redis` (Redis store **không** nằm trong package — đặc thù hạ tầng từng app).
- `apps/discord-bot`'s `DiscordChatHistoryService` dùng thẳng package core (đọc TTL/maxMessages qua `CHAT_HISTORY_TTL_MS`/`CHAT_HISTORY_MAX_MESSAGES`, mặc định 30 phút / 20 message) — chưa có backend phân tán, xem `docs/turborepo-migration-plan.md` Phase 3.
- Sửa package → rebuild + test cả 2 app (`npx turbo run build test --filter=@wispace/messenger-bot... --filter=@wispace/discord-bot... --filter=@wispace/chat-history`).

## Ranh giới monorepo: `packages/student-report`

`packages/student-report` (`@wispace/student-report`) là package framework-agnostic thứ năm — `StudentReportCore` (fetch capacity → gọi LLM → parse JSON → fallback → format text báo cáo năng lực học viên), types (`StudentCapacityInput`/`StudentCapacityReport`), errors (`StudentReportNoScoreDataError`, `StudentReportRetryableError`), và messages (R1/R3 guidance) dùng chung mọi bot.

- **Không** import NestJS — chỉ dependency `openai` + `@wispace/llm-agent` (tái dùng `LlmExecutionPort`/`LlmUsageRecorderPort`). App implement `CapacityDataPort` (gọi Wispace API) + ports LLM thật bằng service NestJS, rồi `new StudentReportCore(config, ports)` — xem `apps/messenger-bot/src/modules/student-report/application/services/student-report.service.ts` làm adapter mỏng.
- Markdown-stripping (Messenger không render Markdown) là **platform-specific** — truyền qua `config.sanitizeText` (optional hook), không hardcode trong package. Discord/Zalo có thể bỏ trống để giữ nguyên Markdown.
- **Không di chuyển** vào package: `StudentCapacityService`/Wispace API calls thật, cron gửi báo cáo định kỳ (`ReportCronService`), retry/outbox logic (`report-send-retry-dispatch.service.ts`) — các phần này đặc thù app, ở lại `apps/messenger-bot`.
- App-local domain error classes (`apps/messenger-bot/src/modules/student-report/domain/errors/*.ts`) chỉ **re-export** class của package — bắt buộc để `instanceof` khớp giữa nơi throw (`TaskScoreAverageApiService`) và nơi catch (`MessengerService`, `ReportCronService`, `ReportSendRetryDispatchService`); không tạo class trùng tên riêng.
- Sửa package → rebuild + test `apps/messenger-bot` (`npx turbo run build test --filter=@wispace/messenger-bot... --filter=@wispace/student-report`).

## Ranh giới monorepo: `packages/chat-queue-core`

`packages/chat-queue-core` (`@wispace/chat-queue-core`) là package framework-agnostic thứ sáu — `DebounceChatQueue<TContext>`, một state machine debounce/merge theo từng user (buffer trong debounce window, gộp tin nhắn đến khi đang xử lý batch trước, evict user rảnh rỗi) dùng chung mọi bot.

- **Không** import NestJS — plain class. Mọi logic nội dung (merge/cap text, reserve quota, gọi LLM, gửi outbound) nằm ở `ChatQueueFlushHandler` do app inject vào, **không** nằm trong core.
- **Idempotency key**: package export type `IdempotencyKeyPort<TRawMessage>` — đây là **contract**, không phải logic chạy trong core. Idempotency key (Messenger: `message.mid`, Discord: `message.id`) được từng platform tự resolve tại tầng ingestion (webhook/gateway) **trước khi** gọi `enqueue()`; core chỉ mang hộ chuỗi string đó qua `ChatQueueBatch.idempotencyKey`, không tự diễn giải.
- `apps/messenger-bot`'s `MessengerChatQueueService` dùng `DebounceChatQueue` cho **chế độ memory** (`CHAT_QUEUE_STORE=memory`); chế độ Redis/distributed (`enqueueDistributed`, `flushDistributed`, `ChatQueueStorePort`) **không** nằm trong package — đặc thù hạ tầng, giữ ở app (cùng pattern với `@wispace/chat-history`: chỉ memory backend được tách, Redis ở lại app).
- Sửa package → rebuild + test `apps/messenger-bot` (`npx turbo run build test --filter=@wispace/messenger-bot... --filter=@wispace/chat-queue-core`). `apps/discord-bot` chưa có debounce/queue — khi thêm, dùng thẳng package này thay vì viết lại state machine.

## Ranh giới monorepo: `packages/study-reminder-core`

`packages/study-reminder-core` (`@wispace/study-reminder-core`) là package framework-agnostic thứ bảy — hàm thuần tính toán lịch nhắc học (`computeRemindAt`, `getMinutesUntilSession`, `isSessionStarted`, `formatScheduledTimeLabel`), không có state, không đọc config/I-O.

- **Không** import gì ngoài `Intl`/`Date` built-in. App tự đọc `STUDY_REMINDER_*` từ `ConfigService` rồi truyền giá trị (minutesBefore, minLeadMinutes, timezone) vào các hàm thuần — xem `apps/messenger-bot/src/modules/study-reminder/application/services/study-reminder-schedule.service.ts` làm adapter mỏng.
- **Chưa tách** orchestration sync (`StudyReminderSyncService`: query mapping → fetch session → upsert job) và dispatch (`StudyReminderDispatchService`: claim job → gửi qua `MESSAGE_SENDER`) — cả hai đã đứng sau port riêng (`MessengerMappingReaderPort`, `StudyReminderJobRepositoryPort`) nhưng **chưa có bot thứ 2 nào cần** (Discord đọc/ghi lịch trực tiếp qua `DiscordStudyCalendarCommandService`, kể cả `reschedule_study_session`, nhưng chưa có hệ thống job nhắc lịch/outbox sync riêng của nó). Ép tách bây giờ là abstraction sớm không có consumer thật để verify — để dành khi Discord/Zalo thực sự cần job nhắc lịch riêng.
- Sửa package → rebuild + test `apps/messenger-bot` (`npx turbo run build test --filter=@wispace/messenger-bot... --filter=@wispace/study-reminder-core`).

## Luồng phụ thuộc trong 1 app (bắt buộc)

```
presentation → application → domain ← infrastructure
```

| Tầng | Thư mục | Được phép | Không được |
|------|---------|-----------|------------|
| **Domain** | `domain/` | Types, entities thuần, repository **interface** | Import NestJS, TypeORM, HTTP, OpenAI, service khác module |
| **Application** | `application/` | Use cases / services, ports (interface + Symbol token) | Controller, TypeORM entity, `fetch` trực tiếp |
| **Infrastructure** | `infrastructure/` | Repository impl, API client, Meta profile | Import `presentation/` |
| **Presentation** | `presentation/` | Controller, (DTO nếu có) | Logic nghiệp vụ — chỉ delegate xuống `application/` |

**Shared / cross-cutting** (không phải feature, trong `apps/messenger-bot/src/`):

- `shared/config/` — hằng POC (`poc.constants.ts`)
- `shared/common/` — guard, module dùng chung
- `shared/prompts/` — `*.system.txt` (nội dung đặc thù Messenger), load qua `loadSystemPromptFile()` từ `@wispace/llm-agent`
- `infrastructure/database/` — TypeORM entities, migrations, `DatabaseModule` (DB dùng chung, chưa tách package — xem `docs/turborepo-migration-plan.md` Phase 2)

## Cấu trúc feature module

```
apps/messenger-bot/src/modules/<feature>/
├── <feature>.module.ts
├── domain/
│   ├── entities/          # types thuần (không @Entity)
│   └── repositories/      # *.repository.port.ts + export Symbol token
├── application/
│   ├── ports/             # interface giao tiếp cross-module
│   ├── services/          # orchestration / use cases (@Injectable)
│   ├── messages/          # copy user-facing (nếu cần)
│   └── utils/
├── infrastructure/
│   ├── persistence/       # TypeORM repository implements port
│   └── wispace/ | meta/   # HTTP client, Meta API
└── presentation/
    └── controllers/
```

## Module hiện có (`apps/messenger-bot`)

| Module | Nest module | Ghi chú |
|--------|-------------|---------|
| messenger | `MessengerModule` + `MessengerOutboundModule` | Webhook, chat queue/agent (adapter dùng `@wispace/llm-agent`), shared state H7; outbound = Send API |
| chat-rate-limit | `ChatRateLimitModule` | Quota FREE_FORM, idempotency, hard cap H3 |
| student-report | `StudentReportModule` | Không có controller |
| study-reminder | `StudyReminderModule` | Cron trong worker; HTTP ops ở `SchedulerModule` |
| scheduler | `SchedulerModule` | Cron báo cáo + ops HTTP `/messenger/*` |

## Ports & DI tokens (cross-module, trong `apps/messenger-bot`)

| Token | Interface | Implement | Consumer |
|-------|-----------|-----------|----------|
| `MESSENGER_REPOSITORY` | `MessengerRepositoryPort` | `MessengerRepository` | `MessengerService`, `ReportCronService` |
| `MESSENGER_MAPPING_READER` | `MessengerMappingReaderPort` | `MessengerRepository` | `StudyReminderSyncService`, `UserDisplayNameService` |
| `MESSAGE_SENDER` | `MessageSenderPort` | `MessengerOutboundService` | `StudyReminderDispatchService` |
| `CHAT_RATE_LIMIT_REPOSITORY` | `ChatRateLimitRepositoryPort` | `ChatRateLimitRepository` | `ChatRateLimitService` |
| `CHAT_QUEUE_STORE` | `ChatQueueStorePort` | `ChatQueueStoreResolver` → Redis | `MessengerChatQueueService` (distributed) |
| `CHAT_HISTORY_STORE` | `ChatHistoryStorePort` | `ChatHistoryStoreResolver` | `MessengerChatHistoryService` |
| `STUDY_REMINDER_JOB_REPOSITORY` | `StudyReminderJobRepositoryPort` | `StudyReminderJobRepository` | (dự phòng inject qua port) |

**Quy tắc:** Application layer inject port bằng `@Inject(TOKEN)` + `import type` cho interface (isolatedModules). Ngoài app (package `@wispace/llm-agent`) dùng port constructor thuần (không NestJS DI).

**Không** import `MessengerModule` từ `StudyReminderModule` — dùng `MessengerOutboundModule`.

**Không** dùng `forwardRef` giữa messenger ↔ study-reminder (đã bỏ).

## Thêm code mới — checklist

1. Xác định **app** (`apps/messenger-bot`, hoặc app bot mới) rồi **feature module** trong đó — không tạo file lẻ ở `src/` root (trừ `app.*`, `main.ts`).
2. **Domain types** → `domain/entities/` hoặc `domain/types/` — không gắn decorator ORM.
3. **TypeORM entity** → `apps/messenger-bot/src/infrastructure/database/entities/` + migration.
4. **Repository** — interface trong `domain/repositories/`; class trong `infrastructure/persistence/`; bind token trong `*.module.ts`.
5. **HTTP** → `presentation/controllers/` — gọi application service, không gọi repository trực tiếp.
6. **Wispace / Meta / OpenAI** → `infrastructure/` của module tương ứng (trong app), hoặc `packages/llm-agent` nếu là orchestration/schema dùng chung cho mọi bot.
7. **Prompt LLM đặc thù platform** → `apps/<bot>/src/shared/prompts/`; load qua `loadSystemPromptFile()` từ `@wispace/llm-agent`. **Thông báo dùng chung** (không đặc thù platform) → `packages/llm-agent/src/messages.ts`.
8. Sau sửa prompt: `npx turbo run build --filter=@wispace/messenger-bot...` (assets → `apps/messenger-bot/dist/shared/prompts/`).

## Anti-patterns

| Sai | Đúng |
|-----|------|
| `@Entity()` trong `domain/` | Entity ORM ở `infrastructure/database/entities/` |
| `StudyReminderModule` import `MessengerModule` | Import `MessengerOutboundModule` + port |
| `MessengerService` trong dispatch | `MESSAGE_SENDER` + `StudyReminderService` |
| Reserve quota trong webhook | `ChatRateLimitService` trong `MessengerChatQueueService` flush |
| Service mới ở `apps/messenger-bot/src/messenger/*.ts` (flat) | Đúng tầng trong `apps/messenger-bot/src/modules/messenger/...` |
| Import NestJS/TypeORM trong `packages/llm-agent` | Package chỉ dùng port interface, app implement bằng Nest |
| Business logic gọi Wispace API trong `packages/llm-agent` | Tool handler ở lại app, implement `ToolExecutorPort` |
| Hardcode path migration cũ `dist/database/` | `apps/messenger-bot/dist/infrastructure/database/data-source.js` |

## Verify

Trước khi xong task: `npx turbo run lint build test --filter=@wispace/messenger-bot...` (thêm `--filter=@wispace/llm-agent` nếu có sửa package).

# Clean Architecture — wispace-bots (Turborepo monorepo)

Repo dùng **feature modules + 4 tầng** theo chuẩn NestJS Clean Architecture (tham khảo [clean-nestjs-cli](https://github.com/jheisonnovak/clean-nestjs-cli), [NestJS-DDD-DevOps](https://andrea-acampora.github.io/nestjs-ddd-devops/)), trong `apps/messenger-bot/src/`. Đường dẫn dưới đây đều tương đối so với `apps/messenger-bot/src/` trừ khi ghi rõ khác.

## Ranh giới monorepo: `packages/llm-agent`

`packages/llm-agent` (`@wispace/llm-agent`) là package **framework-agnostic** dùng chung cho mọi bot (Messenger, Discord, Zalo) — chứa orchestration LLM function-calling (`LlmAgentService`), tool schema (`AGENT_TOOLS`), safety utils (prompt injection, grounding, OpenAI error), và text/scope utils domain WISPACE.

- **Không** import NestJS/TypeORM/Express trong `packages/llm-agent` — chỉ dependency `openai`.
- **Không** đặt business logic gọi Wispace API / DB trong package này — đó là tool handler (`ToolExecutorPort`), sống trong từng app (`apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent-tools.service.ts`).
- Mỗi app implement các port (`LlmExecutionPort`, `LlmUsageRecorderPort`, `LlmSafetyEventPort`, `AgentMetricsPort`, `ToolExecutorPort<T>`) bằng service NestJS thật, rồi gọi `new LlmAgentService(config, ports)` — xem `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` làm ví dụ adapter mỏng.
- Sửa package → phải rebuild + test cả app phụ thuộc (`npx turbo run build test --filter=@wispace/messenger-bot...`).

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

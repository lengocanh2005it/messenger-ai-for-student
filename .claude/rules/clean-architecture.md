# Clean Architecture — demo_send_message_fb

Repo dùng **feature modules + 4 tầng** theo chuẩn NestJS Clean Architecture (tham khảo [clean-nestjs-cli](https://github.com/jheisonnovak/clean-nestjs-cli), [NestJS-DDD-DevOps](https://andrea-acampora.github.io/nestjs-ddd-devops/)).

## Luồng phụ thuộc (bắt buộc)

```
presentation → application → domain ← infrastructure
```

| Tầng | Thư mục | Được phép | Không được |
|------|---------|-----------|------------|
| **Domain** | `domain/` | Types, entities thuần, repository **interface** | Import NestJS, TypeORM, HTTP, OpenAI, service khác module |
| **Application** | `application/` | Use cases / services, ports (interface + Symbol token) | Controller, TypeORM entity, `fetch` trực tiếp |
| **Infrastructure** | `infrastructure/` | Repository impl, API client, Meta profile | Import `presentation/` |
| **Presentation** | `presentation/` | Controller, (DTO nếu có) | Logic nghiệp vụ — chỉ delegate xuống `application/` |

**Shared / cross-cutting** (không phải feature):

- `src/shared/config/` — hằng POC (`poc.constants.ts`)
- `src/shared/common/` — guard, module dùng chung
- `src/shared/prompts/` — `*.system.txt`, `load-system-prompt.ts`
- `src/infrastructure/database/` — TypeORM entities, migrations, `DatabaseModule`

## Cấu trúc feature module

```
src/modules/<feature>/
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

## Module hiện có

| Module | Nest module | Ghi chú |
|--------|-------------|---------|
| messenger | `MessengerModule` + `MessengerOutboundModule` | Webhook, chat queue/agent, shared state H7; outbound = Send API |
| chat-rate-limit | `ChatRateLimitModule` | Quota FREE_FORM, idempotency, hard cap H3 |
| student-report | `StudentReportModule` | Không có controller |
| study-reminder | `StudyReminderModule` | Cron trong worker; HTTP ops ở `SchedulerModule` |
| scheduler | `SchedulerModule` | Cron báo cáo + ops HTTP `/messenger/*` |

## Ports & DI tokens (cross-module)

| Token | Interface | Implement | Consumer |
|-------|-----------|-----------|----------|
| `MESSENGER_REPOSITORY` | `MessengerRepositoryPort` | `MessengerRepository` | `MessengerService`, `ReportCronService` |
| `MESSENGER_MAPPING_READER` | `MessengerMappingReaderPort` | `MessengerRepository` | `StudyReminderSyncService`, `UserDisplayNameService` |
| `MESSAGE_SENDER` | `MessageSenderPort` | `MessengerOutboundService` | `StudyReminderDispatchService` |
| `CHAT_RATE_LIMIT_REPOSITORY` | `ChatRateLimitRepositoryPort` | `ChatRateLimitRepository` | `ChatRateLimitService` |
| `CHAT_QUEUE_STORE` | `ChatQueueStorePort` | `ChatQueueStoreResolver` → Redis | `MessengerChatQueueService` (distributed) |
| `CHAT_HISTORY_STORE` | `ChatHistoryStorePort` | `ChatHistoryStoreResolver` | `MessengerChatHistoryService` |
| `STUDY_REMINDER_JOB_REPOSITORY` | `StudyReminderJobRepositoryPort` | `StudyReminderJobRepository` | (dự phòng inject qua port) |

**Quy tắc:** Application layer inject port bằng `@Inject(TOKEN)` + `import type` cho interface (isolatedModules).

**Không** import `MessengerModule` từ `StudyReminderModule` — dùng `MessengerOutboundModule`.

**Không** dùng `forwardRef` giữa messenger ↔ study-reminder (đã bỏ).

## Thêm code mới — checklist

1. Xác định **feature module** — không tạo file lẻ ở `src/` root (trừ `app.*`, `main.ts`).
2. **Domain types** → `domain/entities/` hoặc `domain/types/` — không gắn decorator ORM.
3. **TypeORM entity** → `src/infrastructure/database/entities/` + migration.
4. **Repository** — interface trong `domain/repositories/`; class trong `infrastructure/persistence/`; bind token trong `*.module.ts`.
5. **HTTP** → `presentation/controllers/` — gọi application service, không gọi repository trực tiếp.
6. **Wispace / Meta / OpenAI** → `infrastructure/` của module tương ứng.
7. **Prompt LLM** → `src/shared/prompts/`; load qua `loadSystemPrompt()`.
8. Sau sửa prompt: `npm run build` (assets → `dist/shared/prompts/`).

## Anti-patterns

| Sai | Đúng |
|-----|------|
| `@Entity()` trong `domain/` | Entity ORM ở `infrastructure/database/entities/` |
| `StudyReminderModule` import `MessengerModule` | Import `MessengerOutboundModule` + port |
| `MessengerService` trong dispatch | `MESSAGE_SENDER` + `StudyReminderService` |
| Reserve quota trong webhook | `ChatRateLimitService` trong `MessengerChatQueueService` flush |
| Service mới ở `src/messenger/*.ts` (flat) | Đúng tầng trong `src/modules/messenger/...` |
| Hardcode path migration cũ `dist/database/` | `dist/infrastructure/database/data-source.js` |

## Verify

Trước khi xong task: `npm run lint && npm run build && npm run test`.

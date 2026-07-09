# Clean Architecture 4 tầng

Mỗi feature module trong `apps/messenger-bot/src/modules/` tuân theo 4 tầng: `domain` → `application` ← `infrastructure` → `presentation`. Domain chỉ chứa pure types và repository interfaces, không phụ thuộc NestJS hay TypeORM.

## Lý do

- **Testability**: Domain và application services không phụ thuộc framework → unit test nhanh, không cần mock NestJS container.
- **Cross-module DI an toàn**: Các module giao tiếp qua ports (`MESSAGE_SENDER`, `MESSENGER_REPOSITORY`) thay vì import trực tiếp service. Tránh circular dependency (đặc biệt `StudyReminderModule` → `MessengerOutboundModule`, không phải `MessengerModule`).
- **Framework-agnostic packages**: `packages/llm-agent` là pure TypeScript, không import NestJS. Có thể dùng cho任何 bot framework (NestJS, Express, Fastify).
- **Tách responsibility rõ ràng**: Controller mỏng (delegate xuống application), service chứa business logic, infrastructure chỉ lo persistence và external calls.

## Phương án đã loại

| Phương án | Lý do loại |
|-----------|-----------|
| NestJS default flat (tất cả trong `services/`) | Circular dependency dễ xảy ra khi modules import nhau. Khó test vì phụ thuộc NestJS container. |
| Hexagonal architecture (ports & adapters) | Gần giống nhưng NestJS đã có DI container sẵn, không cần thêm abstraction layer. |
| DDD full (entities, value objects, aggregates) | Quá nặng cho POC. Cần nhiều boilerplate hơn mức cần thiết. |

## Hậu quả

- Mỗi module có nhiều files hơn (4 thư mục con). Developer mới cần time làm quen.
- Cần discipline: không import TypeORM entities trong domain layer, không dùng `@Inject()` trong domain interfaces.
- Khi scale, các ports cross-module (`MESSAGE_SENDER` etc.) sẽ cần thêm versioning hoặc API contract khi tách microservices.

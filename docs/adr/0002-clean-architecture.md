# 4-layer Clean Architecture

Each feature module in `apps/messenger-bot/src/modules/` follows 4 layers: `domain` → `application` ← `infrastructure` → `presentation`. Domain contains only pure types and repository interfaces, with no dependency on NestJS or TypeORM.

## Rationale

- **Testability**: Domain and application services are framework-independent, enabling fast unit tests without needing to mock the NestJS container.
- **Safe cross-module DI**: Modules communicate via ports (`MESSAGE_SENDER`, `MESSENGER_REPOSITORY`) rather than importing services directly. This avoids circular dependencies (especially `StudyReminderModule` → `MessengerOutboundModule`, not `MessengerModule`).
- **Framework-agnostic packages**: `packages/llm-agent` is pure TypeScript with no NestJS imports. It can be used with any bot framework (NestJS, Express, Fastify).
- **Clear separation of concerns**: Controllers are thin (delegating to application layer), services contain business logic, and infrastructure handles persistence and external calls only.

## Alternatives considered

| Alternative | Reason for rejection |
|-------------|---------------------|
| NestJS default flat structure (everything in `services/`) | Circular dependencies arise easily when modules import each other. Hard to test due to NestJS container dependency. |
| Hexagonal architecture (ports & adapters) | Similar in spirit, but NestJS already provides a DI container — no need for an additional abstraction layer. |
| Full DDD (entities, value objects, aggregates) | Too heavy for a POC. Requires more boilerplate than necessary. |

## Consequences

- Each module has more files (4 subdirectories). New developers need time to get familiar with the structure.
- Discipline is required: do not import TypeORM entities in the domain layer, and do not use `@Inject()` in domain interfaces.
- When scaling, cross-module ports (`MESSAGE_SENDER`, etc.) will need versioning or API contracts if microservices are split out.

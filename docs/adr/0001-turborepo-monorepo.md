# Turborepo monorepo instead of multi-repo

The bots (Messenger, Discord, Zalo) and shared packages (`llm-agent`, `chat-metering`, `wispace-client`, `chat-history`, `student-report`, `chat-queue-core`, `study-reminder-core`) live in a single repo using npm workspaces + Turborepo, rather than being split into separate repositories.

## Rationale

- **Shared code is tightly coupled**: `llm-agent` and `chat-metering` evolve alongside all three bots. Multi-repo would require constant version publishing and bumping, creating friction for a POC.
- **Single source of truth for DB schema**: A single shared `ai_chat_bot_db`. Multi-repo would require a schema registry or cross-repo migrations.
- **Simple CI/CD**: Turborepo caching + filtering (`--filter=@wispace/messenger-bot...`) builds only the relevant parts quickly. No need for another monorepo tool.
- **POC stage**: No need to split teams or independent deploy pipelines yet. When scaling to production multi-tenant, this can be reconsidered.

## Alternatives considered

| Alternative | Reason for rejection |
|-------------|---------------------|
| Multi-repo (one repo per bot) | Shared packages would need versioning + publish workflows. Too complex for a POC. |
| Nx monorepo | Good, but Turborepo is lighter, has faster caching, and a more npm-native ecosystem. |
| Lerna monorepo | Deprecated; Turborepo is the successor. |

## Consequences

- All apps and packages share a single build pipeline. CI time increases as the repo grows, but this is acceptable for now.
- Releases are tightly coupled — a single PR can affect all three bots. Careful testing is needed before merging.
- When teams split or independent deployments are required, migration to multi-repo or adding independent pipelines will be necessary.

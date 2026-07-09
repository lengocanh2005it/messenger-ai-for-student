# @wispace/zalo-bot

Not yet implemented. This is a placeholder in Turborepo for the Zalo bot.

See the detailed implementation plan at [docs/turborepo-migration-plan.md](../../docs/turborepo-migration-plan.md) — Phase 4.

When implementing: use the Zalo OA API, create an equivalent `MessageSenderPort` implementation, and wire `@wispace/llm-agent` (see `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` as a reference example of how to adapt a bot into the shared package).
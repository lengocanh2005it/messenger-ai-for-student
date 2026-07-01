# @wispace/discord-bot

Chưa triển khai. Đây là placeholder giữ chỗ trong Turborepo cho Discord bot.

Xem kế hoạch triển khai chi tiết ở [docs/turborepo-migration-plan.md](../../docs/turborepo-migration-plan.md) — Phase 3.

Khi triển khai: dùng [Necord](https://necord.org/) (wrapper NestJS quanh `discord.js`, decorator `@Once`/`@On`/`@SlashCommand`/`@Context()`, tích hợp module/DI theo đúng phong cách NestJS đã dùng trong `apps/messenger-bot`), implement `MessageSenderPort`-tương-đương riêng, và wire `@wispace/llm-agent` (xem `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` làm ví dụ tham khảo cách adapter một bot vào package dùng chung).

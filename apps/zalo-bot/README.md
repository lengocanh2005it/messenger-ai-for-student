# @wispace/zalo-bot

Chưa triển khai. Đây là placeholder giữ chỗ trong Turborepo cho Zalo bot.

Xem kế hoạch triển khai chi tiết ở [docs/turborepo-migration-plan.md](../../docs/turborepo-migration-plan.md) — Phase 4.

Khi triển khai: dùng Zalo OA API, implement `MessageSenderPort`-tương-đương riêng, và wire `@wispace/llm-agent` (xem `apps/messenger-bot/src/modules/messenger/application/agent/messenger-agent.service.ts` làm ví dụ tham khảo cách adapter một bot vào package dùng chung).

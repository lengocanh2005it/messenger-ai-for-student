# Turborepo monorepo thay vì multi-repo

Các bot (Messenger, Discord, Zalo) và shared packages (`llm-agent`, `chat-metering`, `wispace-client`, `chat-history`, `student-report`, `chat-queue-core`, `study-reminder-core`) sống trong cùng một repo với npm workspaces + Turborepo, thay vì tách thành nhiều repo riêng.

## Lý do

- **Shared code tightly coupled**: `llm-agent` và `chat-metering` thay đổi theo cả ba bot. Multi-repo sẽ yêu cầu publish version + bump liên tục, tạo friction cho POC.
- **Single source of truth cho DB schema**: Một `ai_chat_bot_db` dùng chung. Multi-repo sẽ cần schema registry hoặc cross-repo migrations.
- **CI/CD đơn giản**: Turborepo cache + filter (`--filter=@wispace/messenger-bot...`) build nhanh chỉ phần liên quan. Không cần monorepo tool khác.
- **POC stage**: Chưa cần tách team hay独立 deploy pipeline. Khi scale sang production multi-tenant có thể reconsider.

## Phương án đã loại

| Phương án | Lý do loại |
|-----------|-----------|
| Multi-repo (mỗi bot một repo) | Shared packages sẽ cần versioning + publish workflow. Phức tạp quá mức cho POC. |
| Nx monorepo | Tốt nhưng Turborepo nhẹ hơn, caching nhanh hơn, ecosystem npm-native hơn. |
| Lerna monorepo | Đã deprecated, Turborepo là successor. |

## Hậu quả

- Tất cả apps và packages build chung một pipeline. CI time tăng nếu repo lớn nhưng hiện tại chấp nhận được.
- Releases耦tight — một PR có thể ảnh hưởng cả ba bot. Cần careful testing trước khi merge.
- Khi tách team hoặc cần deploy độc lập, sẽ cần chuyển sang multi-repo hoặc добави independent pipelines.

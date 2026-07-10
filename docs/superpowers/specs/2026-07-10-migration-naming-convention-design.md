# Thiết kế: Quy ước đặt tên & ownership cho TypeORM migration (multi-bot)

**Ngày:** 2026-07-10
**Phạm vi:** `apps/messenger-bot/src/infrastructure/database/migrations/`, `.claude/rules/database.md`

## Bối cảnh

Repo hiện có 18 migration file trong `apps/messenger-bot/src/infrastructure/database/migrations/`, chạy qua 1 pipeline duy nhất (`messenger-bot` — `docs/turborepo-migration-plan.md` Phase 5 quy định discord-bot **không** tự chạy `migration:run` để tránh race condition). Entity dùng chung giữa các bot (chat-metering: `chat_daily_usage`, `chat_idempotency`, `llm_usage_events`, `llm_safety_events`) đã tách sang `packages/chat-metering/src/entities/` — không trùng lặp.

Pain point: tên file/class migration hiện không phản ánh nhất quán platform sở hữu. Đa số có tiền tố `Messenger...` dù một số migration về sau (`CreateC2QuotaAndLlmUsageTables`, `GeneralizePlatformIdentifiers`) đã là bảng cross-platform; `CreateDiscordAccountLinksTable` thì có tiền tố `Discord` nhưng nằm trong cùng folder phẳng, không có gì phân biệt trực quan. Khi Zalo bot triển khai (Phase 4) và team thêm migration mới, tình trạng này sẽ khó lần vết hơn.

## Ràng buộc quan trọng

TypeORM lưu migration đã chạy trong bảng `migrations` ở prod DB (`ai_chat_bot_db`) theo **tên class**, không theo đường dẫn file. Đổi tên/class của migration đã chạy ở production sẽ khiến TypeORM không nhận diện được là đã chạy → cố chạy lại → lỗi hoặc trùng lặp schema. Do đó **không sửa/đổi tên 18 migration hiện có**.

## Quyết định đã chốt (qua thảo luận)

- Giữ nguyên pipeline tập trung — chỉ `messenger-bot` chạy `migration:run` cho mọi bot.
- Không tạo package `@wispace/migrations` hay bất kỳ package mới nào — vấn đề là naming/tổ chức, không phải kiến trúc.
- Không tạo subfolder vật lý (`migrations/shared/`, `migrations/discord/`...) — giữ `data-source.ts` glob đơn giản, tránh rủi ro/độ phức tạp không cần thiết cho lợi ích nhỏ.

## Thiết kế

### 1. Quy ước đặt tên cho migration mới (áp dụng từ nay, không hồi tố)

Khi thêm migration mới (Discord, Zalo, hoặc bảng shared mới):

- **Bảng đặc thù 1 platform** → tiền tố platform trong tên class/file: `Create<Platform><Feature>Table`, ví dụ `CreateZaloAccountLinksTable` (nhất quán với `CreateDiscordAccountLinksTable` đã có).
- **Bảng cross-platform thật sự** (entity sống trong `packages/*`, theo pattern `chat-metering`) → tên phản ánh domain, **không** gắn tiền tố platform gây hiểu nhầm (không đặt `CreateMessenger...` cho bảng dùng chung). Ví dụ tên miêu tả chức năng thuần: `CreateXyzTable`.
- Không migrate/đổi tên các file cũ để khớp quy ước — chỉ áp dụng cho file mới.

### 2. Bảng tra cứu ownership cho 18 migration hiện có

Thêm một bảng ngắn vào `.claude/rules/database.md` (mục mới, dưới "Thêm migration"), liệt kê từng trong 18 file hiện có thuộc nhóm nào: **Messenger-only** / **Discord** / **Shared (packages/chat-metering)** / **Cross-platform (generalize)**. Đây là tài liệu tra cứu tĩnh, không sửa code.

Phân loại đã verify (đọc `CREATE TABLE`/`ALTER TABLE`/`DROP TABLE` thật trong từng file):

| Nhóm | File | Bảng chạm tới |
|------|------|---------------|
| Messenger-only | `1717747200000-CreateMessengerTables` | `user_messenger_mappings`, `messenger_message_logs` |
| Messenger-only | `1717747200001-CreateStudyReminderJobs` | `study_reminder_jobs` |
| Messenger-only | `1717747200002-CreateMessengerChatRateLimitTables` | `messenger_chat_daily_usage`, `messenger_chat_idempotency` (tiền thân trước khi đổi tên generic ở `chat-metering`) |
| Messenger-only | `1717747200003-CreateMessengerChatSharedQueueTables` | `messenger_chat_queue_buffer`, `messenger_chat_history`, `messenger_chat_webhook_seen` |
| Messenger-only | `1717747200004-CreateMessengerScheduledReportClaims` | `messenger_scheduled_report_claims` |
| Messenger-only | `1717747200005-CreateMessengerWebhookDeadLetterTable` | `messenger_webhook_dead_letters` |
| Messenger-only | `1717747200006-CreateReportSendJobs` | `report_send_jobs` |
| Messenger-only | `1717747200007-AddMessengerIndexes` | index-only, không tạo bảng mới |
| Messenger-only | `1717747200008-CreateMessengerUsersCacheTable` | `users` (+ view `"Users"`) |
| Messenger-only | `1717747200009-DropMessengerChatWebhookSeenTable` | drop `messenger_chat_webhook_seen` |
| Messenger-only | `1717747200010-DropMessengerChatQueueBufferAndHistoryTables` | drop `messenger_chat_queue_buffer`, `messenger_chat_history` |
| Messenger-only | `1717747200011-TrimUsersCacheToMessengerMappings` | alter `users` (index-only, không tạo bảng) |
| Messenger-only | `1717747200012-AddUniqueActiveMessengerMappingIndexes` | index-only trên `user_messenger_mappings` |
| Shared (packages/chat-metering) | `1717747200013-CreateC2QuotaAndLlmUsageTables` | `messenger_chat_events` (tiền thân `chat_quota_events`), `llm_usage_events` |
| Shared (packages/chat-metering) | `1751029200000-CreateLlmSafetyEventsTable` | `llm_safety_events` |
| Shared (packages/chat-metering) | `1751029200003-AddLlmUsageEventsCachedTokens` | alter `llm_usage_events` |
| Cross-platform (generalize) | `1751029200001-GeneralizePlatformIdentifiers` | alter `user_messenger_mappings` → `user_platform_mappings`, đổi tên các bảng chat-metering sang generic (`chat_daily_usage`, `chat_idempotency`, `chat_quota_events`) |
| Discord | `1751029200002-CreateDiscordAccountLinksTable` | `discord_account_links` |

### 3. Ghi chú bổ sung trong `database.md`

Thêm 1 câu ngắn giải thích lý do không đổi tên migration cũ (ràng buộc TypeORM tracking theo class name) để tránh agent/dev tương lai tự ý rename khi "dọn dẹp".

## Ngoài phạm vi

- Không tạo package migration mới.
- Không tách subfolder vật lý trong `migrations/`.
- Không đổi cơ chế pipeline (vẫn 1 app chạy migration).
- Không migrate lại 18 file cũ.

## Kiểm thử / Verify

Đây là thay đổi tài liệu + quy ước (không đổi code chạy được), nên không cần chạy test. Verify bằng cách:
- Đọc lại `.claude/rules/database.md` sau khi sửa — đảm bảo không mâu thuẫn với nội dung hiện có.
- Xác nhận bảng phân loại 18 migration khớp đúng nội dung từng file (đọc file, không đoán) trước khi viết vào doc.

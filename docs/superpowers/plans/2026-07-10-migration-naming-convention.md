# Migration Naming & Ownership Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cập nhật `.claude/rules/database.md` để (a) ghi lại quy ước đặt tên cho migration TypeORM mới (Discord/Zalo/shared) từ nay trở đi, và (b) thêm bảng tra cứu ownership cho 18 migration hiện có trong `apps/messenger-bot/src/infrastructure/database/migrations/`, không sửa bất kỳ file migration nào.

**Architecture:** Đây là thay đổi tài liệu thuần (1 file `.md`), không có code chạy được, không có test tự động. "Test" ở đây = đọc lại file để đảm bảo không mâu thuẫn với nội dung sẵn có và bảng ownership khớp đúng nội dung migration thật (đã verify bằng `grep` trong bước brainstorming).

**Tech Stack:** Markdown, không có build/test step.

## Global Constraints

- Không đổi tên/nội dung 18 file migration hiện có trong `apps/messenger-bot/src/infrastructure/database/migrations/` — TypeORM track migration đã chạy theo class name trong bảng `migrations` ở prod DB (`ai_chat_bot_db`); đổi tên sẽ khiến production chạy nhầm lại migration cũ.
- Không tạo package mới (`@wispace/migrations` hay tương tự).
- Không tạo subfolder vật lý trong `migrations/`.
- Không đổi cơ chế pipeline — vẫn chỉ `messenger-bot` chạy `migration:run` cho mọi bot.
- File đích: `E:\wispace-bot\.claude\rules\database.md` — giữ nguyên toàn bộ nội dung hiện có (dòng 1–47), chỉ **thêm** 2 mục mới.

---

### Task 1: Thêm mục "Quy ước đặt tên migration mới" và bảng ownership vào `database.md`

**Files:**
- Modify: `E:\wispace-bot\.claude\rules\database.md` (chèn 2 mục mới sau mục `## Thêm migration`, trước mục `## Lưu ý`, tức sau dòng 40, trước dòng 42)

**Interfaces:**
- Không có — thay đổi tài liệu độc lập, không phụ thuộc code hay task khác.

- [ ] **Step 1: Chèn nội dung mới vào `database.md`**

Dùng Edit tool, tìm đoạn sau (nguyên văn dòng 40 hiện tại):

```
DB dùng chung giữa các bot (Messenger, Discord nay, Zalo sau) — khóa đã generalize thành `(platform, external_user_id)` ở Phase 2, xem `docs/turborepo-migration-plan.md`. Entity của 4 bảng chat-metering (`chat_daily_usage`, `chat_idempotency`, `llm_usage_events`, `llm_safety_events`) sống trong `packages/chat-metering`, **không** thêm entity trùng trong `apps/*/infrastructure/database/entities/` — chỉ migration (do messenger-bot chạy) mới sửa schema các bảng này.

## Lưu ý
```

Thay bằng (giữ nguyên đoạn cũ, chèn 2 mục mới ở giữa):

```
DB dùng chung giữa các bot (Messenger, Discord nay, Zalo sau) — khóa đã generalize thành `(platform, external_user_id)` ở Phase 2, xem `docs/turborepo-migration-plan.md`. Entity của 4 bảng chat-metering (`chat_daily_usage`, `chat_idempotency`, `llm_usage_events`, `llm_safety_events`) sống trong `packages/chat-metering`, **không** thêm entity trùng trong `apps/*/infrastructure/database/entities/` — chỉ migration (do messenger-bot chạy) mới sửa schema các bảng này.

## Quy ước đặt tên migration mới (áp dụng từ nay, không hồi tố)

Khi thêm migration mới (Discord, Zalo, hoặc bảng shared mới):

- **Bảng đặc thù 1 platform** → tiền tố platform trong tên class/file: `Create<Platform><Feature>Table`, ví dụ `CreateZaloAccountLinksTable` (nhất quán với `CreateDiscordAccountLinksTable` đã có).
- **Bảng cross-platform thật sự** (entity sống trong `packages/*`, theo pattern `chat-metering`) → tên phản ánh domain, **không** gắn tiền tố platform gây hiểu nhầm (không đặt `CreateMessenger...` cho bảng dùng chung).
- **Không đổi tên các file migration cũ** để khớp quy ước này — TypeORM lưu migration đã chạy theo **class name** trong bảng `migrations` ở prod DB (`ai_chat_bot_db`); đổi tên class = production tưởng là migration mới → chạy lại/lỗi. Quy ước chỉ áp dụng cho file mới.

## Ownership 18 migration hiện có (tra cứu tĩnh, không phải hồi tố)

| Nhóm | File | Bảng chạm tới |
|------|------|---------------|
| Messenger-only | `1717747200000-CreateMessengerTables` | `user_messenger_mappings`, `messenger_message_logs` |
| Messenger-only | `1717747200001-CreateStudyReminderJobs` | `study_reminder_jobs` |
| Messenger-only | `1717747200002-CreateMessengerChatRateLimitTables` | `messenger_chat_daily_usage`, `messenger_chat_idempotency` (tiền thân trước khi đổi tên generic) |
| Messenger-only | `1717747200003-CreateMessengerChatSharedQueueTables` | `messenger_chat_queue_buffer`, `messenger_chat_history`, `messenger_chat_webhook_seen` |
| Messenger-only | `1717747200004-CreateMessengerScheduledReportClaims` | `messenger_scheduled_report_claims` |
| Messenger-only | `1717747200005-CreateMessengerWebhookDeadLetterTable` | `messenger_webhook_dead_letters` |
| Messenger-only | `1717747200006-CreateReportSendJobs` | `report_send_jobs` |
| Messenger-only | `1717747200007-AddMessengerIndexes` | index-only, không tạo bảng mới |
| Messenger-only | `1717747200008-CreateMessengerUsersCacheTable` | `users` (+ view `"Users"`) |
| Messenger-only | `1717747200009-DropMessengerChatWebhookSeenTable` | drop `messenger_chat_webhook_seen` |
| Messenger-only | `1717747200010-DropMessengerChatQueueBufferAndHistoryTables` | drop `messenger_chat_queue_buffer`, `messenger_chat_history` |
| Messenger-only | `1717747200011-TrimUsersCacheToMessengerMappings` | alter `users` (index-only) |
| Messenger-only | `1717747200012-AddUniqueActiveMessengerMappingIndexes` | index-only trên `user_messenger_mappings` |
| Shared (`packages/chat-metering`) | `1717747200013-CreateC2QuotaAndLlmUsageTables` | `messenger_chat_events` (tiền thân `chat_quota_events`), `llm_usage_events` |
| Shared (`packages/chat-metering`) | `1751029200000-CreateLlmSafetyEventsTable` | `llm_safety_events` |
| Shared (`packages/chat-metering`) | `1751029200003-AddLlmUsageEventsCachedTokens` | alter `llm_usage_events` |
| Cross-platform (generalize) | `1751029200001-GeneralizePlatformIdentifiers` | alter `user_messenger_mappings` → `user_platform_mappings`, đổi tên bảng chat-metering sang generic (`chat_daily_usage`, `chat_idempotency`, `chat_quota_events`) |
| Discord | `1751029200002-CreateDiscordAccountLinksTable` | `discord_account_links` |

## Lưu ý
```

- [ ] **Step 2: Đọc lại toàn bộ file để kiểm tra không mâu thuẫn**

Đọc `E:\wispace-bot\.claude\rules\database.md` từ đầu đến cuối. Xác nhận:
- Nội dung dòng 1–40 và 42–47 (mục `## Lưu ý`) giữ nguyên y hệt bản gốc.
- 2 mục mới nằm đúng vị trí (sau `## Thêm migration`, trước `## Lưu ý`).
- Bảng ownership có đúng 18 dòng (khớp số lượng file migration thật trong `apps/messenger-bot/src/infrastructure/database/migrations/`).
- Không có ký hiệu Markdown table bị lệch cột (mỗi dòng đúng 3 cột `| Nhóm | File | Bảng chạm tới |`).

Nếu có sai lệch, sửa lại bằng Edit tool trước khi qua bước tiếp theo.

- [ ] **Step 3: Verify migration folder không bị đụng tới**

Chạy:

```bash
cd "E:/wispace-bot" && git status apps/messenger-bot/src/infrastructure/database/migrations/
```

Expected: không có output (working tree clean, không file nào trong `migrations/` bị thay đổi).

- [ ] **Step 4: Commit**

```bash
cd "E:/wispace-bot" && git add .claude/rules/database.md && git commit -m "$(cat <<'EOF'
docs(database): add migration naming convention + ownership lookup

Chốt quy ước đặt tên cho migration mới (platform-prefixed vs shared)
và bảng tra cứu ownership cho 18 migration hiện có, không đổi tên
file cũ để tránh vỡ TypeORM migration tracking ở production.
EOF
)"
```

Expected: commit thành công, `git status` sau đó không còn thay đổi chưa commit trên `database.md`.

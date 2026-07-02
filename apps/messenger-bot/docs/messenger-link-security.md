# Bảo mật liên kết Messenger ↔ WISPACE (`ref` / `userId`)

Tài liệu mô tả **lỗ hổng** khi truyền `userId` thuần qua tham số `ref` trên link `m.me`, các **giải pháp** khả thi, **trade-off**, và **lộ trình khuyến nghị** khi đưa ra dùng thật.

Liên quan: [project-overview.md](./project-overview.md) (luồng link), [edge-cases-roadmap.md §1](./edge-cases-roadmap.md#1-liên-kết-messenger--wispace), code `src/shared/config/poc.constants.ts`, `MessengerMappingService`.

---

## 1. Vấn đề

### 1.1 Hiện trạng POC

Link mở Messenger từ WISPACE có dạng:

```text
https://m.me/{pageId}?ref={userId}&topic=IELTS&cadence=WEEKLY
```

Webhook Meta gửi `referral.ref` → POC parse số nguyên → lưu `user_messenger_mappings` (`psid` ↔ `user_id`).

```typescript
// poc.constants.ts — tin ref là userId hợp lệ nếu parse được số dương
parseUserIdFromRef(ref) → Number.parseInt(ref, 10)
```

**Không có bước xác minh** người mở link có quyền sở hữu `userId` đó.

### 1.2 Rủi ro (IDOR trên account linking)

| Kịch bản | Hậu quả |
|----------|---------|
| Sửa `ref=143` → `ref=999` trên URL `m.me` rồi mở bằng Messenger của mình | PSID của kẻ tấn công map vào **tài khoản nạn nhân** |
| PSID đã link user A, mở link `ref` của user B | **Relink** sang user B (L3 — `MAPPING_USER_ID_RELINK`) |
| Forward / leak link có `ref` hợp lệ | Người khác mở trước → ăn mapping |

**Dữ liệu có thể lộ / sai chủ:**

- **Nhắc lịch học:** sync job theo `userId`, gửi tin proactive theo `psid` đã map → lịch học viên B có thể tới Messenger của người lạ.
- **Báo cáo AI:** cron gửi theo mapping; context `userId` sai trên toàn pipeline.
- **Chat agent:** tool/context hiểu sai chủ tài khoản (tên, mục tiêu, thao tác lịch).
- Một số API Wispace dùng `x-psid` — **không đủ** để coi an toàn; POC + DB shared vẫn coupling theo `user_id` ở nhiều chỗ.

### 1.3 Encode / obfuscate **không** phải giải pháp

| Cách | Chống đổi userId? |
|------|-------------------|
| `ref=143` (hiện tại) | Không |
| Base64 / hex `userId` | Không — decode được, hoặc copy nguyên chuỗi |
| Hash `userId` (không ký) | Không — không verify được, dễ brute số nhỏ |

Cần **bằng chứng phát hành từ WISPACE** (chữ ký hoặc token server-side), không chỉ “che” `userId`.

---

## 2. Giải pháp & trade-off

### 2.1 Giữ `ref = userId` (status quo)

**Mô tả:** Không đổi; tin tưởng mọi `ref` số dương từ webhook.

| Ưu | Nhược |
|----|-------|
| Đơn giản nhất | **Không an toàn** cho production |
| Không cần phối hợp Wispace thêm | Enumeration `userId`, account takeover qua relink |
| Debug dễ | Không audit/revoke link |

**Verdict:** Chỉ chấp nhận được demo nội bộ; **không** go-live user thật.

---

### 2.2 HMAC signed ref

**Mô tả:** WISPACE (user đã login) ký payload; Messenger POC verify trước khi link.

```text
ref = {userId}.{expUnix}.{signature}
signature = HMAC-SHA256("{userId}.{expUnix}", MESSENGER_LINK_SIGNING_SECRET)
```

**Luồng:**

1. User login WISPACE → backend tạo `ref` có `exp` (vd. 24h).
2. User mở `m.me?ref=...`.
3. POC verify chữ ký + chưa hết hạn → mới `upsertPsidUserLink`.

| Ưu | Nhược |
|----|-------|
| Implement nhanh (~0.5–1 ngày) | `userId` vẫn **lộ** trên URL |
| Không cần bảng DB token ngay | Link **share/forward** vẫn dùng được trong TTL |
| Shared secret — 2 service đồng bộ đơn giản | Khó **revoke** từng link (chờ hết `exp`) |
| Chống sửa `userId` nếu không có secret | Cần thêm policy **chặn relink** PSID đã map |

**Verdict:** **Bridge tạm** POC / pilot gấp; không nên là đích cuối production.

---

### 2.3 Opaque one-time token (khuyến nghị production)

**Mô tả:** `ref` là chuỗi ngẫu nhiên (UUID / CSPRNG). `userId` **không** xuất hiện trên URL. WISPACE lưu token server-side; POC verify qua API nội bộ hoặc DB shared.

```mermaid
sequenceDiagram
  participant U as Học viên (login WISPACE)
  participant W as WISPACE backend
  participant M as Messenger POC
  participant F as Meta webhook

  U->>W: Kết nối Messenger
  W->>W: INSERT link_token (token, user_id, exp, used_at)
  W->>U: m.me?ref={token}
  U->>F: Mở Messenger
  F->>M: referral.ref = token
  M->>W: Verify token (internal API / DB)
  W-->>M: userId + hợp lệ
  M->>M: used_at = now, map psid ↔ userId
```

**Schema gợi ý (WISPACE DB):**

```sql
CREATE TABLE messenger_link_tokens (
  token         VARCHAR(64) PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messenger_link_tokens_user ON messenger_link_tokens (user_id);
```

**Quy tắc bắt buộc:**

| Rule | Lý do |
|------|-------|
| Token **one-time** (`used_at` set sau link thành công) | Chống reuse / forward link |
| TTL ngắn (15–30 phút) | Giảm cửa sổ tấn công |
| Chỉ tạo token khi session WISPACE hợp lệ | Đảm bảo chủ tài khoản |
| PSID đã map user A + token user B → **từ chối** | Chốn relink trái phép |
| Ops relink qua `POST /messenger/mapping/relink` + `INTERNAL_API_KEY` | Trường hợp support |

| Ưu | Nhược |
|----|-------|
| Không lộ `userId`; revoke từng token | Cần bảng + API verify (WISPACE làm) |
| One-time + TTL — mạnh nhất cho go-live | Thêm 1 round-trip verify khi webhook link |
| Audit rõ (`created_at`, `used_at`) | POC phụ thuộc Wispace (hoặc DB shared) |
| Phù hợp GDPR / privacy hơn signed ref | Effort cao hơn HMAC một chút (~1–2 ngày tổng 2 team) |

**Verdict:** **Đích cuối** khi đưa ra dùng thật.

---

### 2.4 JWT ngắn hạn trong `ref` (optional, phase sau)

**Mô tả:** `ref` = JWT (claims: `sub=userId`, `exp`, `jti`), ký bằng secret hoặc JWKS.

| Ưu | Nhược |
|----|-------|
| Stateless verify (POC không cần DB token) | Meta `ref` giới hạn ~250 ký tự — JWT dài |
| Chuẩn industry | Vẫn cần `jti` blacklist để one-time / revoke |
| | `userId` có thể vẫn trong payload (nếu không mã hóa) |

**Verdict:** Cân nhắc khi đã có JWKS infra; với POC hiện tại **token opaque + DB** đơn giản và rõ ràng hơn.

---

## 3. So sánh tổng hợp

| Tiêu chí | `userId` thuần | HMAC signed | One-time token |
|----------|----------------|-------------|----------------|
| Chống đổi sang user khác | ✗ | ✓ | ✓ |
| Không lộ userId | ✗ | ✗ | ✓ |
| One-time / chống forward | ✗ | ✗ | ✓ |
| Revoke từng link | ✗ | △ (chờ exp) | ✓ |
| Effort Wispace | — | Thấp | Trung bình |
| Effort Messenger POC | — | Thấp | Trung bình |
| Phù hợp production | ✗ | △ (tạm) | ✓ |

---

## 4. Khuyến nghị lộ trình

### Phase L4 — Link security (chưa làm)

| Bước | Việc làm | Owner |
|------|----------|-------|
| **L4.1** | Bảng `messenger_link_tokens` + API tạo token (login required) | WISPACE |
| **L4.2** | `POST /internal/messenger/verify-link-token` hoặc query DB shared | WISPACE / POC |
| **L4.3** | POC: thay `parseUserIdFromRef` → verify token; từ chối ref số thuần (feature flag) | POC |
| **L4.4** | Chặn relink PSID → userId khác (trừ ops endpoint) | POC |
| **L4.5** | Log `LINK_TOKEN_OK` / `LINK_TOKEN_REJECT` / `MAPPING_RELINK_BLOCKED`; alert ops | POC |

**Hotfix gấp (trước L4):** HMAC signed ref + chặn relink — tối đa 1 ngày, có kế hoạch bỏ khi L4 xong.

### Feature flag gợi ý

```env
MESSENGER_LINK_MODE=token
WISPACE_API_VERIFY_TOKEN_URL=...
WISPACE_INTERNAL_KEY=...
```

POC **chỉ** hỗ trợ `token` — `legacy` / `signed` đã gỡ; startup fail nếu thiếu verify URL hoặc `MESSENGER_LINK_MODE` khác `token`.

---

## 5. Thay đổi code POC (khi implement L4)

| File / module | Thay đổi |
|---------------|----------|
| `src/shared/config/poc.constants.ts` | `parseMessengerLinkContext` gọi verify token thay vì `parseInt(ref)` |
| `MessengerMappingService` | Từ chối relink nếu PSID đã ACTIVE và `userId` khác |
| `MessengerService.handleEvent` | Link chỉ khi verify OK; message `MISSING_USER_REF` / `LINK_TOKEN_INVALID` |
| `.env.example` | Biến `MESSENGER_LINK_*` |
| WISPACE app | Generate `m.me` chỉ qua API backend, không build URL client-side với `userId` |

**API verify nội bộ (gợi ý):**

```http
POST /internal/messenger/verify-link-token
Authorization: Bearer {INTERNAL_API_KEY}
Content-Type: application/json

{ "token": "8f3c...", "psid": "1234567890" }
```

```json
// 200
{ "valid": true, "userId": 143 }

// 400 / 409
{ "valid": false, "reason": "EXPIRED|USED|NOT_FOUND|PSID_ALREADY_LINKED" }
```

---

## 6. Checklist QA (trước go-live)

- [ ] Mở link đúng user → mapping `psid` ↔ `userId` đúng
- [ ] Sửa `ref` / dùng token user khác → **không** link (hoặc không relink)
- [ ] Dùng lại token đã `used_at` → từ chối
- [ ] Token hết hạn → từ chối + hướng dẫn tạo link mới từ app
- [ ] PSID đã link A, token của B → từ chối + log `MAPPING_RELINK_BLOCKED`
- [ ] Ops relink qua API key vẫn hoạt động
- [ ] Nhắc lịch / báo cáo chỉ tới đúng PSID sau link hợp lệ
- [ ] Bấm menu 「Đăng ký báo cáo」khi đã link → dùng mapping DB, **không** gọi verify
- [ ] Bấm Get Started sau khi đã link (không còn `referral.ref`) → dùng mapping DB
- [ ] Token `USED` nhưng PSID đã map → chat/menu vẫn OK; chỉ từ chối nếu cố link lại bằng token cũ

---

## 7. Quyết định thiết kế (bàn luận)

Ghi chú align team sau khi review luồng link — bổ sung cho các mục trên, **chưa implement** (L4).

### 7.1 Hai giai đoạn: binding vs hành vi hàng ngày

| Giai đoạn | Mục đích | Gọi WISPACE verify? |
|-----------|----------|---------------------|
| **Binding** (lễ liên kết) | Chứng minh PSID Meta thuộc user WISPACE nào | **Có — một lần** khi webhook có `referral.ref` / token chưa dùng |
| **Hành vi hàng ngày** | Chat, menu, cron báo cáo, nhắc lịch | **Không** — đọc `user_messenger_mappings` |

**Không** verify mỗi tin nhắn chat: latency cao, phụ thuộc WISPACE, không thêm bảo mật nếu mapping đã đúng. Mô hình tương tự OAuth — login một lần, sau đó tin session (mapping) persisted.

API Wispace khác (vd. `UserCalendar` qua `x-psid`) là **data API**, không thay thế **link verify**.

### 7.2 Khi nào trigger verify? (không chỉ Get Started)

Meta có thể gửi `referral.ref` ở nhiều loại webhook — POC gọi verify tại **mọi chỗ** sắp `linkPsidFromContext` khi `ref` là token mới:

| Nguồn webhook | Có thể có `ref`? |
|---------------|------------------|
| `event.optin` | Có (`optin.ref`) |
| `event.referral` thuần | Có |
| `event.message` + `message.referral` | Có |
| `event.postback` (gồm `GET_STARTED`) + `postback.referral` | Có — thường gặp lần **đầu** mở thread từ `m.me` |

Get Started **thường** trùng lúc binding lần đầu, nhưng ranh giới đúng là **「webhook mang token chưa consumed」**, không phải payload `GET_STARTED` riêng. Lần sau Meta thường **không** gửi lại `referral.ref` → bot fallback `findActiveMappingByPsid`.

### 7.3 Menu / postback sau khi đã link — **không** verify lại

Menu persistent 「Đăng ký báo cáo」(`REGISTER_LEARNING_REPORT`) và các postback khác **không** kèm `referral.ref`. Code hiện tại: `resolveLinkContext` → nếu event không có ref thì đọc mapping DB (`MessengerService.resolveLinkContext`).

| Hành vi | Nguồn `userId` | Gọi WISPACE verify? |
|---------|----------------|---------------------|
| Menu đăng ký báo cáo (đã link) | Mapping DB | **Không** |
| Menu khi chưa link | — | **Không** (không có token) → `MISSING_USER_REF`, hướng dẫn mở link app |
| Chat tự do | Mapping DB | **Không** |

Verify lúc bấm menu **không giúp** user chưa từng link — không có token để gửi. Nếu lo mapping cũ sai chủ: xử lý bằng **chặn relink (7.4)** + **revoke/unlink** trên WISPACE, không verify per-menu.

*Tùy chọn phase sau:* mapping quá cũ (staleness) → nhắn mở lại link app — vẫn **không** gọi verify từ postback menu.

### 7.4 Policy relink — L3 hiện tại vs L4

**Hiện tại (L3):** `MessengerMappingService.relinkPsidToUserId` **cho phép** đổi `userId` cùng PSID khi webhook mang `ref`/token mới → log `MAPPING_USER_ID_RELINK`. Đây là vector IDOR khi `ref=userId` thuần.

**L4 (khuyến nghị):**

| Tình huống | Hành vi |
|------------|---------|
| PSID chưa map + token hợp lệ | Link OK |
| PSID đã map user A + token user A (mở lại link / cập nhật topic) | **Idempotent** — cho phép cập nhật metadata; token đã `used_at` thì bỏ qua verify, tin mapping |
| PSID đã map user A + token user B | **Từ chối** — `PSID_ALREADY_LINKED` / `MAPPING_RELINK_BLOCKED` |
| Đổi tài khoản thật (support) | `POST /messenger/mapping/relink` + `INTERNAL_API_KEY` (đã có) |

**Ba hướng relink hợp lệ (chọn theo giai đoạn):**

| Hướng | Mô tả | Khi dùng |
|-------|-------|----------|
| **A — Ops-only** | Support xác minh ngoài band → gọi `mapping/relink` | Pilot / POC → prod đầu |
| **B — Self-service** | App WISPACE: 「Ngắt kết nối」→ revoke mapping → token mới → link lại | Production scale |
| **C — Confirm trên Messenger** | Postback xác nhận trước khi relink | Hiếm cần; UX phức tạp — **không** khuyến nghị mặc định |

### 7.5 Token TTL — trade-off

Doc gợi ý **15–30 phút**. Cân bằng:

| | TTL ngắn (5–15 ph) | TTL 15–30 ph (khuyến nghị) | TTL dài (HMAC bridge ~24h) |
|--|---------------------|----------------------------|----------------------------|
| Cửa sổ forward link chưa dùng | Nhỏ | Vừa | Lớn |
| UX (user mở link rồi làm việc khác) | Dễ `EXPIRED` | Cân bằng | Thoải mái |
| One-time (`used_at`) | Chặn reuse dù TTL dài | Cùng | Không có — chỉ HMAC tạm |

**Lưu ý:** Meta không gửi `referral.ref` mãi mãi. Token hết hạn **trước** webhook đầu tiên → verify `EXPIRED` → user phải tạo link mới trong app; **không** sửa được chỉ bằng Get Started/menu.

Token đã `USED` nhưng user mở lại URL cũ: verify từ chối, nhưng nếu PSID đã map → chat/menu/cron **vẫn dùng mapping DB**.

App WISPACE nên có nút **「Tạo lại link」** khi hết hạn.

### 7.6 Ma trận quyết định webhook (POC)

```text
Webhook event
│
├─ Có referral.ref (token mới, chưa used)?
│   ├─ PSID chưa map → verify WISPACE → link
│   ├─ PSID map cùng userId → cập nhật topic/cadence nếu cần (idempotent)
│   └─ PSID map userId khác → REJECT (trừ ops relink)
│
└─ Không có ref (chat / menu / Get Started sau này)
    ├─ Có mapping ACTIVE → userId từ DB
    └─ Không mapping → MISSING_USER_REF / hướng dẫn mở link app
```

Chi tiết luồng sự kiện từng loại webhook: [messenger-link-integration.md §9](./messenger-link-integration.md#9-quyết-định-vận-hành-bàn-luận).

---

## 8. Tóm tắt một dòng

**Production:** dùng **opaque one-time token** do WISPACE phát hành khi user đã login, POC verify trước khi map; **không** tin `ref=userId` và **không** relink tự do. **HMAC** chỉ là bước đệm nếu cần ship nhanh trước L4.

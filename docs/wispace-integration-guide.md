# Hướng dẫn tích hợp Bot WISPACE — Dành cho team WISPACE

Tài liệu này mô tả những việc team WISPACE cần làm để tích hợp với hệ thống **Discord Bot** (và đồng nhất với Messenger Bot đã có).

---

## Tổng quan

| Bot | Trạng thái | Cách liên kết tài khoản |
|-----|-----------|------------------------|
| Messenger Bot | Đang chạy production | `m.me/<page>?ref=<token>` |
| Discord Bot | Đang triển khai | Discord OAuth2 + link token |
| Zalo Bot | Kế hoạch tương lai | TBD |

Cả 3 bot dùng **chung 1 API endpoint** để verify link token — team WISPACE chỉ cần implement 1 lần.

---

## Phần 1 — API verify token (chung cho cả Messenger & Discord)

### Endpoint

```
POST {WISPACE_API_VERIFY_TOKEN_URL}
```

URL cụ thể do team WISPACE cung cấp, lưu ở biến môi trường `WISPACE_API_VERIFY_TOKEN_URL` phía bot.

### Header

```
Content-Type: application/json
X-Internal-Key: {WISPACE_INTERNAL_KEY}
```

`WISPACE_INTERNAL_KEY` là shared secret giữa WISPACE backend và các bot — không thay đổi theo platform.

### Request body

```json
{
  "token": "<link_token>",
  "value": "<platform_user_id>",
  "platform": "messenger" | "discord" | "zalo"
}
```

| Field | Mô tả |
|-------|-------|
| `token` | Link token WISPACE đã tạo và gửi cho user |
| `value` | ID người dùng phía platform: PSID (Messenger), Discord User ID (Discord), Zalo User ID (Zalo) |
| `platform` | Tên platform — để WISPACE phân biệt nguồn gọi |

### Response thành công (HTTP 200)

```json
{
  "userId": 143
}
```

`userId` là ID học viên trong hệ thống WISPACE — bot dùng để lưu mapping `(platform, externalUserId) ↔ userId`.

> **Lưu ý Messenger:** ngoài `userId`, response Messenger hiện trả thêm `topic` và `cadence` để cấu hình báo cáo học tập. Discord không cần 2 field này (chưa có tính năng báo cáo định kỳ).

### Response thất bại (HTTP 4xx)

```json
{
  "valid": false,
  "reason": "NOT_FOUND" | "EXPIRED" | "USED" | "INVALID_FORMAT"
}
```

| reason | Ý nghĩa |
|--------|---------|
| `NOT_FOUND` | Token không tồn tại |
| `EXPIRED` | Token đã hết hạn |
| `USED` | Token đã được dùng (1 lần dùng) |
| `INVALID_FORMAT` | Token sai định dạng |

---

## Phần 2 — Luồng liên kết Discord (WISPACE cần làm)

### Bước 1 — Tạo link token

Giống hệt cơ chế hiện tại với Messenger — WISPACE tạo 1 link token ngắn hạn (ví dụ: UUID, JWT, hay bất kỳ chuỗi opaque nào), lưu server-side kèm `userId` + expiry (khuyến nghị: 10–30 phút, dùng 1 lần).

### Bước 2 — Hiển thị nút "Liên kết Discord" trong WISPACE app/web

Render một link (button hoặc `<a href>`) trỏ đến URL sau:

```
https://discord.com/oauth2/authorize
  ?client_id={DISCORD_CLIENT_ID}
  &redirect_uri={DISCORD_OAUTH_REDIRECT_URI}
  &response_type=code
  &scope=identify
  &state={LINK_TOKEN}
```

Thay thế các giá trị:

| Placeholder | Giá trị thực | Ghi chú |
|-------------|-------------|---------|
| `{DISCORD_CLIENT_ID}` | ID của Discord Application | Lấy từ team bot |
| `{DISCORD_OAUTH_REDIRECT_URI}` | `https://<domain-bot>/discord/oauth/callback` | Lấy từ team bot |
| `{LINK_TOKEN}` | Token WISPACE vừa tạo ở Bước 1 | **Truyền nguyên vào `state`** |

> **Quan trọng:** `state` phải là link token nguyên bản (không encode thêm). Bot sẽ đọc `state` và gửi nguyên sang WISPACE API để verify.

Ví dụ URL hoàn chỉnh:

```
https://discord.com/oauth2/authorize?client_id=1521508932164522095&redirect_uri=https%3A%2F%2Fbot.wispace.vn%2Fdiscord%2Foauth%2Fcallback&response_type=code&scope=identify&state=abc123xyz
```

### Bước 3 — Bot tự xử lý phần còn lại

Sau khi user bấm "Cho phép" trên trang Discord, toàn bộ luồng phía bot tự động:

1. Discord redirect về `{DISCORD_OAUTH_REDIRECT_URI}?code=xxx&state={LINK_TOKEN}`
2. Bot đổi `code` → Discord access token → lấy `discordUserId`
3. Bot gọi `POST {WISPACE_API_VERIFY_TOKEN_URL}` với `{ token, value: discordUserId, platform: "discord" }`
4. Bot lưu mapping `discordUserId ↔ userId` vào DB
5. Bot gửi tin nhắn chào mừng vào Discord DM của học viên
6. Bot redirect trình duyệt về trang kết quả (thành công / thất bại)

**WISPACE không cần làm gì thêm sau Bước 2.**

---

## Phần 3 — Luồng Messenger hiện tại (để tham khảo)

Messenger dùng `m.me` deep link để truyền token qua tham số `ref`:

```
https://m.me/{PAGE_ID}?ref={LINK_TOKEN}
```

Khi user click, Facebook gửi `messaging_referrals` event (hoặc `postback`) về webhook của Messenger Bot, kèm `ref = LINK_TOKEN`. Bot verify với cùng API endpoint trên (`platform: "messenger"`).

**Điểm khác biệt duy nhất** so với Discord: cơ chế truyền token (Messenger dùng `ref`, Discord dùng OAuth2 `state`) — còn API verify và response format hoàn toàn giống nhau.

---

## Phần 4 — Thông tin cần cung cấp cho team bot

Để bot chạy được trong production, team WISPACE cần cung cấp:

| Biến | Mô tả |
|------|-------|
| `WISPACE_API_VERIFY_TOKEN_URL` | URL endpoint verify token (dùng chung Messenger + Discord) |
| `WISPACE_INTERNAL_KEY` | Shared secret để xác thực request từ bot |

Và team bot sẽ cung cấp lại cho WISPACE:

| Thông tin | Mô tả |
|-----------|-------|
| `DISCORD_CLIENT_ID` | ID của Discord Application |
| `DISCORD_OAUTH_REDIRECT_URI` | Callback URL đăng ký trên Discord Developer Portal |

---

## Phần 5 — Các header nhận diện học viên khi chat

Sau khi tài khoản đã liên kết, mỗi khi học viên nhắn tin với bot, bot sẽ gọi Wispace API với header nhận diện tương ứng theo platform:

| Platform | Header |
|----------|--------|
| Messenger | `x-psid: {PSID}` |
| Discord | `x-discordid: {Discord User ID}` |
| Zalo (tương lai) | `x-zaloid: {Zalo User ID}` |

Kèm theo header chung:

```
X-Internal-Key: {WISPACE_INTERNAL_KEY}
```

WISPACE API đã hỗ trợ cả 3 header — không cần thay đổi phía WISPACE.

---

## Phần 6 — Yêu cầu về server Discord

Discord có giới hạn kỹ thuật: **bot chỉ có thể gửi DM cho user nếu họ có ít nhất 1 server chung**. Nếu user chưa join server nào có bot, bot sẽ không gửi được tin nhắn chào mừng sau khi liên kết.

### Giải pháp khuyến nghị

WISPACE cần tạo **1 server Discord chính thức** (ví dụ: "WISPACE Community") và thêm bot vào server đó. Học viên được hướng dẫn join server này trước khi liên kết tài khoản.

### Cách tích hợp vào luồng liên kết

Trong trang liên kết Discord của WISPACE app/web, thêm bước hướng dẫn rõ ràng trước nút "Liên kết":

> _"Trước khi liên kết, hãy chắc chắn bạn đã join **[server Discord WISPACE](https://discord.gg/xxx)** để nhận được tin nhắn từ bot."_

Hoặc cung cấp **invite link** của server để bot FE callback page có thể hiển thị nút "Join server WISPACE" khi phát hiện bot không gửi được DM.

### Thông tin cần bổ sung cho team bot

| Thông tin | Mô tả |
|-----------|-------|
| Discord Server Invite URL | Link invite của server WISPACE (dạng `https://discord.gg/xxx`) để hiển thị trên trang kết quả liên kết khi cần |

---

## Tóm tắt việc cần làm

| # | Việc | Bên thực hiện |
|---|------|--------------|
| 1 | Implement API `POST /verify-token` nhận `{ token, value, platform }`, trả `{ userId }` hoặc `{ valid: false, reason }` | **WISPACE** |
| 2 | Tạo link token khi user muốn liên kết Discord, lưu server-side kèm userId + expiry | **WISPACE** |
| 3 | Render nút/link với URL Discord OAuth2, `state` = link token | **WISPACE** |
| 4 | Tạo server Discord chính thức, thêm bot vào server, hướng dẫn học viên join trước khi liên kết | **WISPACE** |
| 5 | Cung cấp `WISPACE_API_VERIFY_TOKEN_URL`, `WISPACE_INTERNAL_KEY`, Discord Server Invite URL cho team bot | **WISPACE** |
| 6 | Cung cấp `DISCORD_CLIENT_ID` và `DISCORD_OAUTH_REDIRECT_URI` cho WISPACE | **Team bot** |
| 7 | Toàn bộ luồng OAuth2 callback, verify, lưu DB, gửi DM chào mừng | **Team bot (đã xong)** |

> Nếu API verify token (`/verify-token`) đã có cho Messenger rồi thì việc hỗ trợ Discord chỉ là thêm điều kiện `platform === "discord"` — không cần endpoint mới.

> **Lưu ý giới hạn Discord:** Nếu học viên chưa join server chung với bot, bot sẽ không gửi được DM chào mừng (giới hạn của Discord, không phải lỗi). Tài khoản vẫn được liên kết thành công — học viên join server sau vẫn nhắn tin với bot bình thường.

# Token-only linking (L4) thay vì ref-only

Account linking giữa Messenger và WISPACE dùng token-based verification: user mở link `m.me` với token, bot gọi `WISPACE_API_VERIFY_TOKEN_URL` để verify `{token, value, platform}`. Ngăn relink PSID đã link với userId khác (L4 constraint).

## Lý do

- **Bảo mật**: Token verification đảm bảo user thực sự control WISPACE account. Ref-only cho phép ai có link `m.me` cũng link được, không verify ownership.
- **1:1 mapping**: Mỗi PSID chỉ link với 1 userId, mỗi userId chỉ link với 1 PSID per platform. Ngăn abuse (nhiều accounts share một bot, hoặc một account link nhiều bots).
- **Ngăn relink (L4)**: Once linked, không thể link lại với userId khác trừ khi có ops intervention (`allowRelink`). Tránh scenario user chuyển đổi account.
- **Cross-platform ready**: Token-based linking hoạt động cho cả Messenger, Discord, Zalo. Ref-only chỉ phù hợp cho Messenger.

## Phương án đã loại

| Phương án | Lý do loại |
|-----------|-----------|
| Ref-only linking (legacy) | Không verify ownership. Bất kỳ ai có link `m.me?ref=X` cũng có thể link account của user khác. |
| OAuth2 full flow | Phức tạp quá mức cho POC. Cần redirect URI, consent screen, refresh tokens. |
| Magic link (email) | Cần email infrastructure. User journey dài hơn. |

## Hậu quả

- User phải click link `m.me` từ trong app WISPACE (không thể share link cho người khác).
- Nếu user muốn link lại với account khác, cần ops intervention (`POST /messenger/mapping/relink`).
- Khi cần multi-device support (cùng một WISPACE account trên nhiều Messenger accounts), sẽ cần reconsider L4 constraint.
- Token expiry và rotation chưa implement — hiện tại token dùng một lần nhưng không expire time limit.

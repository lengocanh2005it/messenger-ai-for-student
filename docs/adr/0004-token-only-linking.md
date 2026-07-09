# Token-only linking (L4) instead of ref-only

Account linking between Messenger and WISPACE uses token-based verification: the user opens an `m.me` link containing a token, and the bot calls `WISPACE_API_VERIFY_TOKEN_URL` to verify `{token, value, platform}`. This prevents relinking a PSID that is already linked to a different userId (L4 constraint).

## Rationale

- **Security**: Token verification ensures the user actually controls the WISPACE account. Ref-only linking allows anyone with the `m.me` link to link an account, without verifying ownership.
- **1:1 mapping**: Each PSID links to only one userId, and each userId links to only one PSID per platform. This prevents abuse (multiple accounts sharing one bot, or one account linking to multiple bots).
- **Relink prevention (L4)**: Once linked, a user cannot relink with a different userId unless ops intervention occurs (`allowRelink`). This prevents account-switching scenarios.
- **Cross-platform ready**: Token-based linking works for Messenger, Discord, and Zalo. Ref-only is only suitable for Messenger.

## Alternatives considered

| Alternative | Reason for rejection |
|-------------|---------------------|
| Ref-only linking (legacy) | Does not verify ownership. Anyone with the `m.me?ref=X` link can link another user's account. |
| Full OAuth2 flow | Too complex for a POC. Requires redirect URIs, consent screens, and refresh tokens. |
| Magic link (email) | Requires email infrastructure. Longer user journey. |

## Consequences

- Users must click the `m.me` link from within the WISPACE app (they cannot share the link with others).
- If a user wants to relink with a different account, ops intervention is required (`POST /messenger/mapping/relink`).
- When multi-device support is needed (the same WISPACE account on multiple Messenger accounts), the L4 constraint will need to be reconsidered.
- Token expiry and rotation are not yet implemented — currently, tokens are single-use but have no expiration time limit.

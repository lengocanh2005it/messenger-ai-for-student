/** Wispace's account-linking header, one per platform — send whichever id you have. */
export type WispaceIdHeader = 'x-psid' | 'x-discordid' | 'x-zaloid';

export function buildWispaceHeaders(
  idHeader: WispaceIdHeader,
  externalId: string,
  internalKey: string,
): Record<string, string> {
  if (!externalId.trim()) {
    throw new Error(`${idHeader} is required for WISPACE API requests`);
  }

  if (!internalKey.trim()) {
    throw new Error(
      'WISPACE internal key is required for WISPACE API requests',
    );
  }

  return {
    [idHeader]: externalId.trim(),
    'X-Internal-Key': internalKey,
    Accept: 'application/json',
  };
}

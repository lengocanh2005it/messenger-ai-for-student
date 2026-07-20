import { createHash, timingSafeEqual } from 'crypto';

/**
 * Zalo webhook signature: mac = sha256(appId + rawBody + timestamp + oaSecretKey).
 * Header name is `X-ZEvent-Signature` (see zalo-webhook.controller.ts).
 */
export function verifyZaloWebhookSignature(params: {
  appId: string;
  rawBody: string;
  timestamp: string;
  oaSecretKey: string;
  signatureHeader: string | undefined;
}): boolean {
  const { appId, rawBody, timestamp, oaSecretKey, signatureHeader } = params;

  if (!signatureHeader) {
    return false;
  }

  const expected = createHash('sha256')
    .update(appId + rawBody + timestamp + oaSecretKey)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, actualBuf);
}

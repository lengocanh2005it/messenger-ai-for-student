import { createHmac, timingSafeEqual } from 'node:crypto';

export const META_WEBHOOK_SIGNATURE_HEADER = 'x-hub-signature-256';
const SIGNATURE_PREFIX = 'sha256=';

export function computeMessengerWebhookSignature(
  rawBody: Buffer | string,
  appSecret: string,
): string {
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  return createHmac('sha256', appSecret).update(body, 'utf8').digest('hex');
}

export function formatMessengerWebhookSignatureHeader(
  signatureHex: string,
): string {
  return `${SIGNATURE_PREFIX}${signatureHex}`;
}

export function buildMessengerWebhookSignatureHeader(
  rawBody: Buffer | string,
  appSecret: string,
): string {
  return formatMessengerWebhookSignatureHeader(
    computeMessengerWebhookSignature(rawBody, appSecret),
  );
}

export function verifyMessengerWebhookSignature(
  rawBody: Buffer | string,
  appSecret: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const providedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expectedHex = computeMessengerWebhookSignature(rawBody, appSecret);

  if (providedHex.length !== expectedHex.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(providedHex, 'utf8'),
      Buffer.from(expectedHex, 'utf8'),
    );
  } catch {
    return false;
  }
}

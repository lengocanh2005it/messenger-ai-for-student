import {
  buildMessengerWebhookSignatureHeader,
  computeMessengerWebhookSignature,
  verifyMessengerWebhookSignature,
} from './messenger-webhook-signature.utils';

describe('messenger-webhook-signature.utils', () => {
  const secret = 'test-app-secret';
  const body = JSON.stringify({
    object: 'page',
    entry: [],
  });

  it('computes stable HMAC-SHA256 hex', () => {
    const first = computeMessengerWebhookSignature(body, secret);
    const second = computeMessengerWebhookSignature(Buffer.from(body), secret);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifies a valid sha256 signature header', () => {
    const header = buildMessengerWebhookSignatureHeader(body, secret);

    expect(verifyMessengerWebhookSignature(body, secret, header)).toBe(true);
  });

  it('rejects missing or wrong signature', () => {
    expect(verifyMessengerWebhookSignature(body, secret, undefined)).toBe(
      false,
    );
    expect(
      verifyMessengerWebhookSignature(body, secret, 'sha256=deadbeef'),
    ).toBe(false);
    expect(
      verifyMessengerWebhookSignature(body, 'other-secret', headerFor(body)),
    ).toBe(false);
  });

  it('rejects tampered body', () => {
    const header = buildMessengerWebhookSignatureHeader(body, secret);

    expect(
      verifyMessengerWebhookSignature(
        body.replace('"page"', '"fake"'),
        secret,
        header,
      ),
    ).toBe(false);
  });
});

function headerFor(payload: string): string {
  return buildMessengerWebhookSignatureHeader(payload, 'test-app-secret');
}

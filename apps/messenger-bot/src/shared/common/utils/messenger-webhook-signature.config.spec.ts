import { ConfigService } from '@nestjs/config';
import {
  getMessengerAppSecret,
  isMessengerWebhookSignatureVerifyEnabled,
} from './messenger-webhook-signature.config';

describe('messenger-webhook-signature.config', () => {
  const createConfig = (values: Record<string, string | undefined>) =>
    ({
      get: (key: string) => values[key],
    }) as ConfigService;

  it('defaults verify to false when secret is unset', () => {
    const config = createConfig({});

    expect(isMessengerWebhookSignatureVerifyEnabled(config)).toBe(false);
    expect(getMessengerAppSecret(config)).toBeUndefined();
  });

  it('defaults verify to true when secret is set', () => {
    const config = createConfig({ MESSENGER_APP_SECRET: 'secret' });

    expect(isMessengerWebhookSignatureVerifyEnabled(config)).toBe(true);
  });

  it('honors explicit MESSENGER_WEBHOOK_SIGNATURE_VERIFY=false', () => {
    const config = createConfig({
      MESSENGER_APP_SECRET: 'secret',
      MESSENGER_WEBHOOK_SIGNATURE_VERIFY: 'false',
    });

    expect(isMessengerWebhookSignatureVerifyEnabled(config)).toBe(false);
  });
});

import {
  isStrictProductionRuntime,
  isTestRuntime,
  readMessengerTokenVerifyUrl,
} from './production-runtime.utils';
import { ConfigService } from '@nestjs/config';

describe('production-runtime.utils', () => {
  const config = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
    }) as ConfigService;

  it('reads legacy WISPACE_API_VERIFY_MESSENGER_TOKEN alias', () => {
    expect(
      readMessengerTokenVerifyUrl(
        config({
          WISPACE_API_VERIFY_MESSENGER_TOKEN:
            'https://example.com/verify-messenger-token',
        }),
      ),
    ).toBe('https://example.com/verify-messenger-token');
  });

  it('prefers WISPACE_API_VERIFY_MESSENGER_TOKEN_URL', () => {
    expect(
      readMessengerTokenVerifyUrl(
        config({
          WISPACE_API_VERIFY_MESSENGER_TOKEN_URL: 'https://example.com/url',
          WISPACE_API_VERIFY_MESSENGER_TOKEN: 'https://example.com/legacy',
        }),
      ),
    ).toBe('https://example.com/url');
  });

  it('detects strict production via ENFORCE_PROD_CHAT_QUOTA', () => {
    expect(
      isStrictProductionRuntime(config({ ENFORCE_PROD_CHAT_QUOTA: 'true' })),
    ).toBe(true);
    expect(isTestRuntime(config({ NODE_ENV: 'test' }))).toBe(true);
  });
});

import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerLinkStartupService } from './messenger-link-startup.service';

describe('MessengerLinkStartupService', () => {
  const createService = (env: Record<string, string | undefined>) => {
    const configService = {
      get: (key: string) => env[key],
    } as ConfigService;

    return new MessengerLinkStartupService(configService);
  };

  it('skips validation when NODE_ENV=test', () => {
    const service = createService({ NODE_ENV: 'test' });

    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('throws when MESSENGER_LINK_MODE is legacy', () => {
    const service = createService({
      NODE_ENV: 'development',
      MESSENGER_LINK_MODE: 'legacy',
      WISPACE_API_VERIFY_TOKEN_URL: 'https://example.com/verify',
      WISPACE_INTERNAL_KEY: 'key',
    });

    expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
    expect(() => service.onModuleInit()).toThrow(/must be "token"/);
  });

  it('throws when verify URL is missing', () => {
    const service = createService({
      NODE_ENV: 'development',
      WISPACE_INTERNAL_KEY: 'key',
    });

    expect(() => service.onModuleInit()).toThrow(/VERIFY_TOKEN_URL/);
  });

  it('throws when WISPACE_INTERNAL_KEY is missing', () => {
    const service = createService({
      NODE_ENV: 'development',
      WISPACE_API_VERIFY_TOKEN_URL: 'https://example.com/verify',
    });

    expect(() => service.onModuleInit()).toThrow(/WISPACE_INTERNAL_KEY/);
  });

  it('passes when token mode env is complete', () => {
    const service = createService({
      NODE_ENV: 'production',
      MESSENGER_LINK_MODE: 'token',
      WISPACE_API_VERIFY_TOKEN_URL: 'https://example.com/verify',
      WISPACE_INTERNAL_KEY: 'key',
    });

    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('passes when MESSENGER_LINK_MODE is unset but verify URL is set', () => {
    const service = createService({
      NODE_ENV: 'production',
      WISPACE_API_VERIFY_TOKEN_URL: 'https://example.com/verify',
      WISPACE_INTERNAL_KEY: 'key',
    });

    expect(() => service.onModuleInit()).not.toThrow();
  });
});

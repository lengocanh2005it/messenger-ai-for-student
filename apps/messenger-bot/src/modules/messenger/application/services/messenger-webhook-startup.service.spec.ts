import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerWebhookStartupService } from './messenger-webhook-startup.service';

describe('MessengerWebhookStartupService', () => {
  const createService = (env: Record<string, string | undefined>) => {
    const configService = {
      get: (key: string) => env[key],
    } as ConfigService;

    return new MessengerWebhookStartupService(configService);
  };

  it('skips when NODE_ENV=test', () => {
    const service = createService({ NODE_ENV: 'test' });
    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('skips in local dev without ENFORCE_PROD_CHAT_QUOTA', () => {
    const service = createService({ NODE_ENV: 'development' });
    expect(() => service.onModuleInit()).not.toThrow();
  });

  it('throws when ENFORCE_PROD_CHAT_QUOTA=true but MESSENGER_APP_SECRET missing', () => {
    const service = createService({
      ENFORCE_PROD_CHAT_QUOTA: 'true',
      MESSENGER_WEBHOOK_SIGNATURE_VERIFY: 'true',
    });

    expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
    expect(() => service.onModuleInit()).toThrow(/MESSENGER_APP_SECRET/);
  });

  it('throws when signature verify explicitly false', () => {
    const service = createService({
      ENFORCE_PROD_CHAT_QUOTA: 'true',
      MESSENGER_APP_SECRET: 'secret',
      MESSENGER_WEBHOOK_SIGNATURE_VERIFY: 'false',
    });

    expect(() => service.onModuleInit()).toThrow(/SIGNATURE_VERIFY/);
  });

  it('passes with secret and verify enabled', () => {
    const service = createService({
      NODE_ENV: 'production',
      MESSENGER_APP_SECRET: 'secret',
      MESSENGER_WEBHOOK_SIGNATURE_VERIFY: 'true',
    });

    expect(() => service.onModuleInit()).not.toThrow();
  });
});

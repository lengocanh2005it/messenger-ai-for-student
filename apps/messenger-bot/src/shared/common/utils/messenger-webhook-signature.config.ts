import { ConfigService } from '@nestjs/config';

export function isMessengerWebhookSignatureVerifyEnabled(
  configService: ConfigService,
): boolean {
  const explicit = configService
    .get<string>('MESSENGER_WEBHOOK_SIGNATURE_VERIFY')
    ?.trim()
    .toLowerCase();

  if (explicit === 'true') {
    return true;
  }

  if (explicit === 'false') {
    return false;
  }

  const appSecret = configService.get<string>('MESSENGER_APP_SECRET')?.trim();
  return Boolean(appSecret);
}

export function getMessengerAppSecret(
  configService: ConfigService,
): string | undefined {
  return configService.get<string>('MESSENGER_APP_SECRET')?.trim() || undefined;
}

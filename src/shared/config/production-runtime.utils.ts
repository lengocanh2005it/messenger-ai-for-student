import { ConfigService } from '@nestjs/config';

export function isTestRuntime(configService: ConfigService): boolean {
  return configService.get<string>('NODE_ENV')?.trim() === 'test';
}

/** Production or VPS with ENFORCE_PROD_CHAT_QUOTA — stricter startup checks. */
export function isStrictProductionRuntime(
  configService: ConfigService,
): boolean {
  if (isTestRuntime(configService)) {
    return false;
  }

  const nodeEnv = configService.get<string>('NODE_ENV')?.trim();
  if (nodeEnv === 'production') {
    return true;
  }

  const enforce = configService
    .get<string>('ENFORCE_PROD_CHAT_QUOTA')
    ?.trim()
    .toLowerCase();

  return enforce === 'true' || enforce === '1' || enforce === 'yes';
}

export function readMessengerTokenVerifyUrl(
  configService: ConfigService,
): string | undefined {
  return (
    configService
      .get<string>('WISPACE_API_VERIFY_MESSENGER_TOKEN_URL')
      ?.trim() ||
    configService.get<string>('WISPACE_API_VERIFY_MESSENGER_TOKEN')?.trim() ||
    undefined
  );
}

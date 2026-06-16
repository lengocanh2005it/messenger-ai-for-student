import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';
import { MessengerWebhookSignatureGuard } from './guards/messenger-webhook-signature.guard';
import { PgAdvisoryLockService } from './pg-advisory-lock.service';

@Module({
  providers: [
    InternalApiKeyGuard,
    MessengerWebhookSignatureGuard,
    PgAdvisoryLockService,
  ],
  exports: [
    InternalApiKeyGuard,
    MessengerWebhookSignatureGuard,
    PgAdvisoryLockService,
  ],
})
export class CommonModule {}

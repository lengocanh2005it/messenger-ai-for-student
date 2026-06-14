import { Module } from '@nestjs/common';
import { InternalApiKeyGuard } from './guards/internal-api-key.guard';
import { PgAdvisoryLockService } from './pg-advisory-lock.service';

@Module({
  providers: [InternalApiKeyGuard, PgAdvisoryLockService],
  exports: [InternalApiKeyGuard, PgAdvisoryLockService],
})
export class CommonModule {}

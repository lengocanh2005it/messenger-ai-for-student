import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessengerChatDailyUsageEntity } from '../../infrastructure/database/entities/messenger-chat-daily-usage.entity';
import { MessengerChatIdempotencyEntity } from '../../infrastructure/database/entities/messenger-chat-idempotency.entity';
import { ChatRateLimitConfigService } from './application/services/chat-rate-limit-config.service';
import { ChatRateLimitStartupService } from './application/services/chat-rate-limit-startup.service';
import { ChatRateLimitService } from './application/services/chat-rate-limit.service';
import { ChatQuotaOpsService } from './application/services/chat-quota-ops.service';
import { CHAT_RATE_LIMIT_REPOSITORY } from './domain/repositories/chat-rate-limit.repository.port';
import { ChatRateLimitRepository } from './infrastructure/persistence/chat-rate-limit.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MessengerChatDailyUsageEntity,
      MessengerChatIdempotencyEntity,
    ]),
  ],
  providers: [
    ChatRateLimitConfigService,
    ChatRateLimitStartupService,
    ChatRateLimitService,
    ChatQuotaOpsService,
    ChatRateLimitRepository,
    {
      provide: CHAT_RATE_LIMIT_REPOSITORY,
      useExisting: ChatRateLimitRepository,
    },
  ],
  exports: [
    ChatRateLimitConfigService,
    ChatRateLimitService,
    ChatQuotaOpsService,
    CHAT_RATE_LIMIT_REPOSITORY,
  ],
})
export class ChatRateLimitModule {}

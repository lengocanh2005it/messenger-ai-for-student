import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../../shared/common/common.module';
import {
  ChatDailyUsageEntity,
  ChatIdempotencyEntity,
} from '@wispace/chat-metering';
import { ChatQuotaEventEntity } from '../../infrastructure/database/entities/chat-quota-event.entity';
import { ChatBurstCounterStartupService } from './application/services/chat-burst-counter-startup.service';
import { ChatQuotaEventCleanupCronService } from './application/services/chat-quota-event-cleanup-cron.service';
import { ChatQuotaEventCleanupService } from './application/services/chat-quota-event-cleanup.service';
import { ChatQuotaEventRecorderService } from './application/services/chat-quota-event-recorder.service';
import { ChatRateLimitConfigService } from './application/services/chat-rate-limit-config.service';
import { ChatRateLimitStartupService } from './application/services/chat-rate-limit-startup.service';
import { ChatRateLimitService } from './application/services/chat-rate-limit.service';
import { ChatQuotaOpsService } from './application/services/chat-quota-ops.service';
import { CHAT_BURST_COUNTER } from './domain/repositories/chat-burst-counter.port';
import { CHAT_QUOTA_EVENT_REPOSITORY } from './domain/repositories/chat-quota-event.repository.port';
import { CHAT_QUOTA_REPOSITORY } from './domain/repositories/chat-quota.repository.port';
import { ChatBurstCounterResolver } from './infrastructure/persistence/chat-burst-counter.resolver';
import { ChatQuotaEventRepository } from './infrastructure/persistence/chat-quota-event.repository';
import { MemoryChatBurstCounter } from './infrastructure/persistence/memory-chat-burst-counter';
import { PostgresChatBurstCounter } from './infrastructure/persistence/postgres-chat-burst-counter';
import { RedisChatBurstCounter } from './infrastructure/persistence/redis-chat-burst-counter';
import { ChatRateLimitRepository } from './infrastructure/persistence/chat-rate-limit.repository';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      ChatDailyUsageEntity,
      ChatIdempotencyEntity,
      ChatQuotaEventEntity,
    ]),
  ],
  providers: [
    ChatRateLimitConfigService,
    ChatRateLimitStartupService,
    MemoryChatBurstCounter,
    PostgresChatBurstCounter,
    RedisChatBurstCounter,
    ChatBurstCounterResolver,
    ChatBurstCounterStartupService,
    {
      provide: CHAT_BURST_COUNTER,
      useExisting: ChatBurstCounterResolver,
    },
    ChatQuotaEventRepository,
    {
      provide: CHAT_QUOTA_EVENT_REPOSITORY,
      useExisting: ChatQuotaEventRepository,
    },
    ChatQuotaEventRecorderService,
    ChatQuotaEventCleanupService,
    ChatQuotaEventCleanupCronService,
    ChatRateLimitService,
    ChatQuotaOpsService,
    ChatRateLimitRepository,
    {
      provide: CHAT_QUOTA_REPOSITORY,
      useExisting: ChatRateLimitRepository,
    },
  ],
  exports: [
    ChatRateLimitConfigService,
    ChatRateLimitService,
    ChatQuotaOpsService,
    CHAT_QUOTA_REPOSITORY,
  ],
})
export class ChatRateLimitModule {}

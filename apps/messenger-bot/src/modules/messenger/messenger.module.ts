import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebhookDeadLetterEntity } from '../../infrastructure/database/entities';
import { MESSENGER_WEBHOOK_DEAD_LETTER_REPOSITORY } from './domain/repositories/messenger-webhook-dead-letter.repository.port';
import { MessengerWebhookDeadLetterRepository } from './infrastructure/persistence/messenger-webhook-dead-letter.repository';
import { CommonModule } from '../../shared/common/common.module';
import { ChatRateLimitModule } from '../chat-rate-limit/chat-rate-limit.module';
import { LlmExecutionModule } from '../llm-execution/llm-execution.module';
import { LlmUsageModule } from '../llm-usage/llm-usage.module';
import { LlmSafetyModule } from '../llm-safety/llm-safety.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerAgentToolsService } from './application/agent/messenger-agent-tools.service';
import { MessengerAgentService } from './application/agent/messenger-agent.service';
import { ChatHistoryStoreStartupService } from './application/services/chat-history-store-startup.service';
import { ChatQueueStoreStartupService } from './application/services/chat-queue-store-startup.service';

import { WebhookDedupeStoreStartupService } from './application/services/webhook-dedupe-store-startup.service';
import { MessengerChatQueueService } from './application/services/messenger-chat-queue.service';
import { MessengerChatQueueWorkerService } from './application/services/messenger-chat-queue-worker.service';
import { MessengerMessageLogCleanupCronService } from './application/services/messenger-message-log-cleanup-cron.service';
import { MessengerMessageLogCleanupService } from './application/services/messenger-message-log-cleanup.service';
import { MessengerWebhookDeadLetterCronService } from './application/services/messenger-webhook-dead-letter-cron.service';
import { MessengerChatSharedConfigService } from './application/services/messenger-chat-shared-config.service';
import { MessengerMappingService } from './application/services/messenger-mapping.service';
import { MessengerLinkContextService } from './application/services/messenger-link-context.service';
import { MessengerLinkStartupService } from './application/services/messenger-link-startup.service';
import { MessengerWebhookStartupService } from './application/services/messenger-webhook-startup.service';
import { MessengerRescheduleConfirmationService } from './application/services/messenger-reschedule-confirmation.service';
import { MessengerReportDeliveryService } from './application/services/messenger-report-delivery.service';
import { MessengerReminderDeliveryService } from './application/services/messenger-reminder-delivery.service';
import { MessengerService } from './application/services/messenger.service';
import { MessengerProfileService } from './infrastructure/meta/messenger-profile.service';
import { WispaceMessengerTokenVerifyService } from './infrastructure/wispace/wispace-messenger-token-verify.service';
import { CHAT_QUEUE_STORE } from './domain/repositories/chat-queue.store.port';
import { CHAT_HISTORY_STORE } from './domain/repositories/chat-history.store.port';
import { WEBHOOK_DEDUPE_STORE } from './domain/repositories/webhook-dedupe.store.port';
import { ChatQueueStoreResolver } from './infrastructure/persistence/chat-queue.store.resolver';
import { RedisChatQueueStore } from './infrastructure/persistence/redis-chat-queue.store';
import { ChatHistoryStoreResolver } from './infrastructure/persistence/chat-history.store.resolver';
import { MemoryChatHistoryStore } from './infrastructure/persistence/memory-chat-history.store';
import { RedisChatHistoryStore } from './infrastructure/persistence/redis-chat-history.store';
import { MemoryWebhookDedupeStore } from './infrastructure/persistence/memory-webhook-dedupe.store';
import { RedisWebhookDedupeStore } from './infrastructure/persistence/redis-webhook-dedupe.store';
import { WebhookDedupeStoreResolver } from './infrastructure/persistence/webhook-dedupe.store.resolver';
import { MessengerOutboundModule } from './messenger-outbound.module';
import { MessengerController } from './presentation/controllers/messenger.controller';

@Module({
  imports: [
    CommonModule,
    MessengerOutboundModule,
    ChatRateLimitModule,
    LlmExecutionModule,
    LlmUsageModule,
    LlmSafetyModule,
    StudentReportModule,
    StudyReminderModule,
    TypeOrmModule.forFeature([WebhookDeadLetterEntity]),
  ],
  controllers: [MessengerController],
  providers: [
    MessengerService,
    MessengerChatSharedConfigService,
    MemoryChatHistoryStore,
    RedisChatHistoryStore,
    ChatHistoryStoreResolver,
    ChatHistoryStoreStartupService,
    {
      provide: CHAT_HISTORY_STORE,
      useExisting: ChatHistoryStoreResolver,
    },
    MemoryWebhookDedupeStore,
    RedisWebhookDedupeStore,
    WebhookDedupeStoreResolver,
    WebhookDedupeStoreStartupService,
    {
      provide: WEBHOOK_DEDUPE_STORE,
      useExisting: WebhookDedupeStoreResolver,
    },
    RedisChatQueueStore,
    ChatQueueStoreResolver,
    ChatQueueStoreStartupService,
    {
      provide: CHAT_QUEUE_STORE,
      useExisting: ChatQueueStoreResolver,
    },
    MessengerChatQueueService,
    MessengerChatQueueWorkerService,
    MessengerAgentService,
    MessengerAgentToolsService,
    MessengerProfileService,
    MessengerMappingService,
    MessengerLinkContextService,
    MessengerLinkStartupService,
    MessengerWebhookStartupService,
    MessengerRescheduleConfirmationService,
    MessengerReportDeliveryService,
    MessengerReminderDeliveryService,
    WispaceMessengerTokenVerifyService,
    MessengerWebhookDeadLetterRepository,
    {
      provide: MESSENGER_WEBHOOK_DEAD_LETTER_REPOSITORY,
      useExisting: MessengerWebhookDeadLetterRepository,
    },
    MessengerWebhookDeadLetterCronService,
    MessengerMessageLogCleanupService,
    MessengerMessageLogCleanupCronService,
  ],
  exports: [
    MessengerOutboundModule,
    MessengerService,
    MessengerMappingService,
    MessengerReportDeliveryService,
  ],
})
export class MessengerModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerChatHistoryEntity,
  MessengerChatQueueBufferEntity,
  MessengerChatWebhookSeenEntity,
  MessengerWebhookDeadLetterEntity,
} from '../../infrastructure/database/entities';
import { MESSENGER_WEBHOOK_DEAD_LETTER_REPOSITORY } from './domain/repositories/messenger-webhook-dead-letter.repository.port';
import { MessengerWebhookDeadLetterRepository } from './infrastructure/persistence/messenger-webhook-dead-letter.repository';
import { CommonModule } from '../../shared/common/common.module';
import { ChatRateLimitModule } from '../chat-rate-limit/chat-rate-limit.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerAgentToolsService } from './application/agent/messenger-agent-tools.service';
import { MessengerAgentService } from './application/agent/messenger-agent.service';
import { ChatHistoryStoreStartupService } from './application/services/chat-history-store-startup.service';
import { MessengerChatHistoryService } from './application/services/messenger-chat-history.service';
import { MessengerChatQueueService } from './application/services/messenger-chat-queue.service';
import { MessengerChatQueueWorkerService } from './application/services/messenger-chat-queue-worker.service';
import { MessengerWebhookDeadLetterCronService } from './application/services/messenger-webhook-dead-letter-cron.service';
import { MessengerChatSharedConfigService } from './application/services/messenger-chat-shared-config.service';
import { MessengerMappingService } from './application/services/messenger-mapping.service';
import { MessengerService } from './application/services/messenger.service';
import { MessengerProfileService } from './infrastructure/meta/messenger-profile.service';
import { CHAT_HISTORY_STORE } from './domain/repositories/chat-history.store.port';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from './domain/repositories/messenger-chat-shared-state.repository.port';
import { ChatHistoryStoreResolver } from './infrastructure/persistence/chat-history.store.resolver';
import { MemoryChatHistoryStore } from './infrastructure/persistence/memory-chat-history.store';
import { PostgresChatHistoryStore } from './infrastructure/persistence/postgres-chat-history.store';
import { RedisChatHistoryStore } from './infrastructure/persistence/redis-chat-history.store';
import { MessengerChatSharedStateRepository } from './infrastructure/persistence/messenger-chat-shared-state.repository';
import { MessengerOutboundModule } from './messenger-outbound.module';
import { MessengerController } from './presentation/controllers/messenger.controller';

@Module({
  imports: [
    CommonModule,
    MessengerOutboundModule,
    ChatRateLimitModule,
    StudentReportModule,
    StudyReminderModule,
    TypeOrmModule.forFeature([
      MessengerChatQueueBufferEntity,
      MessengerChatHistoryEntity,
      MessengerChatWebhookSeenEntity,
      MessengerWebhookDeadLetterEntity,
    ]),
  ],
  controllers: [MessengerController],
  providers: [
    MessengerService,
    MessengerChatSharedConfigService,
    MemoryChatHistoryStore,
    PostgresChatHistoryStore,
    RedisChatHistoryStore,
    ChatHistoryStoreResolver,
    ChatHistoryStoreStartupService,
    {
      provide: CHAT_HISTORY_STORE,
      useExisting: ChatHistoryStoreResolver,
    },
    MessengerChatHistoryService,
    MessengerChatQueueService,
    MessengerChatQueueWorkerService,
    MessengerAgentService,
    MessengerAgentToolsService,
    MessengerProfileService,
    MessengerMappingService,
    MessengerChatSharedStateRepository,
    {
      provide: MESSENGER_CHAT_SHARED_STATE_REPOSITORY,
      useExisting: MessengerChatSharedStateRepository,
    },
    MessengerWebhookDeadLetterRepository,
    {
      provide: MESSENGER_WEBHOOK_DEAD_LETTER_REPOSITORY,
      useExisting: MessengerWebhookDeadLetterRepository,
    },
    MessengerWebhookDeadLetterCronService,
  ],
  exports: [MessengerOutboundModule, MessengerService, MessengerMappingService],
})
export class MessengerModule {}

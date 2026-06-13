import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerChatHistoryEntity,
  MessengerChatQueueBufferEntity,
  MessengerChatWebhookSeenEntity,
} from '../../infrastructure/database/entities';
import { CommonModule } from '../../shared/common/common.module';
import { ChatRateLimitModule } from '../chat-rate-limit/chat-rate-limit.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerAgentToolsService } from './application/agent/messenger-agent-tools.service';
import { MessengerAgentService } from './application/agent/messenger-agent.service';
import { MessengerChatHistoryService } from './application/services/messenger-chat-history.service';
import { MessengerChatQueueService } from './application/services/messenger-chat-queue.service';
import { MessengerChatQueueWorkerService } from './application/services/messenger-chat-queue-worker.service';
import { MessengerChatSharedConfigService } from './application/services/messenger-chat-shared-config.service';
import { MessengerMappingService } from './application/services/messenger-mapping.service';
import { MessengerService } from './application/services/messenger.service';
import { MessengerProfileService } from './infrastructure/meta/messenger-profile.service';
import { MESSENGER_CHAT_SHARED_STATE_REPOSITORY } from './domain/repositories/messenger-chat-shared-state.repository.port';
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
    ]),
  ],
  controllers: [MessengerController],
  providers: [
    MessengerService,
    MessengerChatSharedConfigService,
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
  ],
  exports: [MessengerOutboundModule, MessengerService, MessengerMappingService],
})
export class MessengerModule {}

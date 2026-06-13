import { Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { ChatRateLimitModule } from '../chat-rate-limit/chat-rate-limit.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerAgentToolsService } from './application/agent/messenger-agent-tools.service';
import { MessengerAgentService } from './application/agent/messenger-agent.service';
import { MessengerChatHistoryService } from './application/services/messenger-chat-history.service';
import { MessengerChatQueueService } from './application/services/messenger-chat-queue.service';
import { MessengerService } from './application/services/messenger.service';
import { MessengerProfileService } from './infrastructure/meta/messenger-profile.service';
import { MessengerOutboundModule } from './messenger-outbound.module';
import { MessengerController } from './presentation/controllers/messenger.controller';

@Module({
  imports: [
    CommonModule,
    MessengerOutboundModule,
    ChatRateLimitModule,
    StudentReportModule,
    StudyReminderModule,
  ],
  controllers: [MessengerController],
  providers: [
    MessengerService,
    MessengerChatHistoryService,
    MessengerChatQueueService,
    MessengerAgentService,
    MessengerAgentToolsService,
    MessengerProfileService,
  ],
  exports: [MessengerOutboundModule, MessengerService],
})
export class MessengerModule {}

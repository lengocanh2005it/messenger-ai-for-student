import { Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerOutboundModule } from './messenger-outbound.module';
import { MessengerMappingService } from './application/services/messenger-mapping.service';
import { MessengerLinkContextService } from './application/services/messenger-link-context.service';
import { MessengerLinkStartupService } from './application/services/messenger-link-startup.service';
import { WispaceMessengerTokenVerifyService } from './infrastructure/wispace/wispace-messenger-token-verify.service';

/**
 * Self-contained module for user linking flow:
 * link context resolution → mapping → token verify.
 *
 * Exports: MessengerMappingService, MessengerLinkContextService.
 */
@Module({
  imports: [CommonModule, MessengerOutboundModule, StudyReminderModule],
  providers: [
    MessengerMappingService,
    MessengerLinkContextService,
    MessengerLinkStartupService,
    WispaceMessengerTokenVerifyService,
  ],
  exports: [MessengerMappingService, MessengerLinkContextService],
})
export class UserLinkingModule {}

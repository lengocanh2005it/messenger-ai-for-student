import { Module } from '@nestjs/common';
import { CommonModule } from '../../shared/common/common.module';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerService } from './application/services/messenger.service';
import { MessengerProfileService } from './infrastructure/meta/messenger-profile.service';
import { MessengerOutboundModule } from './messenger-outbound.module';
import { MessengerController } from './presentation/controllers/messenger.controller';

@Module({
  imports: [
    CommonModule,
    MessengerOutboundModule,
    StudentReportModule,
    StudyReminderModule,
  ],
  controllers: [MessengerController],
  providers: [MessengerService, MessengerProfileService],
  exports: [MessengerOutboundModule, MessengerService],
})
export class MessengerModule {}

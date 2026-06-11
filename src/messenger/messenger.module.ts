import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '../common/common.module';
import {
  MessengerMessageLogEntity,
  UserMessengerMappingEntity,
} from '../database/entities';
import { StudentReportModule } from '../student-report/student-report.module';
import { StudyReminderModule } from '../study-reminder/study-reminder.module';
import { MessengerController } from './messenger.controller';
import { MessengerProfileService } from './messenger-profile.service';
import { MessengerRepository } from './messenger.repository';
import { MessengerService } from './messenger.service';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forFeature([
      UserMessengerMappingEntity,
      MessengerMessageLogEntity,
    ]),
    StudentReportModule,
    forwardRef(() => StudyReminderModule),
  ],
  controllers: [MessengerController],
  providers: [MessengerService, MessengerProfileService, MessengerRepository],
  exports: [MessengerService, MessengerRepository],
})
export class MessengerModule {}

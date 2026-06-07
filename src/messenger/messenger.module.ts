import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerMessageLogEntity,
  UserMessengerMappingEntity,
} from '../database/entities';
import { StudentReportModule } from '../student-report/student-report.module';
import { MessengerController } from './messenger.controller';
import { MessengerProfileService } from './messenger-profile.service';
import { MessengerRepository } from './messenger.repository';
import { MessengerService } from './messenger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserMessengerMappingEntity,
      MessengerMessageLogEntity,
    ]),
    StudentReportModule,
  ],
  controllers: [MessengerController],
  providers: [MessengerService, MessengerProfileService, MessengerRepository],
  exports: [MessengerService, MessengerRepository],
})
export class MessengerModule {}

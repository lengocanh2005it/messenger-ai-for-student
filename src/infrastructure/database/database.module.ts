import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerChatDailyUsageEntity,
  MessengerChatHistoryEntity,
  MessengerChatIdempotencyEntity,
  MessengerChatQueueBufferEntity,
  MessengerChatWebhookSeenEntity,
  MessengerMessageLogEntity,
  MessengerScheduledReportClaimEntity,
  ReportSendJobEntity,
  StudyReminderJobEntity,
  UserEntity,
  UserMessengerMappingEntity,
} from './entities';
import { getAppTypeOrmOptions } from './typeorm.options';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => getAppTypeOrmOptions(config),
    }),
    TypeOrmModule.forFeature([
      UserMessengerMappingEntity,
      MessengerMessageLogEntity,
      MessengerScheduledReportClaimEntity,
      ReportSendJobEntity,
      MessengerChatDailyUsageEntity,
      MessengerChatIdempotencyEntity,
      MessengerChatQueueBufferEntity,
      MessengerChatHistoryEntity,
      MessengerChatWebhookSeenEntity,
      StudyReminderJobEntity,
      UserEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

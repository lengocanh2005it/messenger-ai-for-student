import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerChatDailyUsageEntity,
  MessengerChatIdempotencyEntity,
  MessengerMessageLogEntity,
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
      MessengerChatDailyUsageEntity,
      MessengerChatIdempotencyEntity,
      StudyReminderJobEntity,
      UserEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

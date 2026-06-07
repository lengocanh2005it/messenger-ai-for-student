import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MessengerMessageLogEntity,
  UserMessengerMappingEntity,
  UserProfileEntity,
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
      UserProfileEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

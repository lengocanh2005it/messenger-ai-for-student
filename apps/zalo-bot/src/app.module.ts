import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';
import { DatabaseModule } from './infrastructure/database/database.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Own .env wins; falls back to root .env.shared for cross-bot vars
      // (WISPACE_INTERNAL_KEY, OPENAI_*, DB_*...) — see .env.shared.example.
      envFilePath: ['.env', '../../.env.shared'],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
  ],
})
export class AppModule {}

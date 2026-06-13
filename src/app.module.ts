import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './infrastructure/database/database.module';
import { MessengerModule } from './modules/messenger/messenger.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { StudentReportModule } from './modules/student-report/student-report.module';
import { StudyReminderModule } from './modules/study-reminder/study-reminder.module';
import { ChatRateLimitModule } from './modules/chat-rate-limit/chat-rate-limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    ScheduleModule.forRoot(),
    StudentReportModule,
    StudyReminderModule,
    MessengerModule,
    SchedulerModule,
    ChatRateLimitModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

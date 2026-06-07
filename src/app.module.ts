import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { MessengerModule } from './messenger/messenger.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { StudentReportModule } from './student-report/student-report.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    ScheduleModule.forRoot(),
    StudentReportModule,
    MessengerModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

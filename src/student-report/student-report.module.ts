import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfileEntity } from '../database/entities';
import { StudentCapacityRepository } from './student-capacity.repository';
import { StudentCapacityService } from './student-capacity.service';
import { StudentReportService } from './student-report.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserProfileEntity])],
  providers: [
    StudentCapacityRepository,
    StudentCapacityService,
    StudentReportService,
  ],
  exports: [StudentReportService, StudentCapacityService],
})
export class StudentReportModule {}

import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StudentReportNoScoreDataError } from '../../domain/errors/student-report-no-score-data.error';
import { buildStudentReportNoScoreDataMessage } from '../messages/student-report.messages';
import { StudentCapacityService } from './student-capacity.service';
import { StudentReportService } from './student-report.service';

describe('StudentReportService', () => {
  it('returns friendly message when Wispace has no score data (R1)', async () => {
    const studentCapacityService = {
      getCapacityData: jest.fn(() =>
        Promise.reject(new StudentReportNoScoreDataError('psid-1')),
      ),
    } as unknown as StudentCapacityService;

    const service = new StudentReportService(
      { get: () => undefined } as ConfigService,
      studentCapacityService,
    );

    await expect(service.generateReport('psid-1')).resolves.toBe(
      buildStudentReportNoScoreDataMessage(),
    );
  });

  it('rethrows non-score errors', async () => {
    const studentCapacityService = {
      getCapacityData: jest.fn(() =>
        Promise.reject(new InternalServerErrorException('API down')),
      ),
    } as unknown as StudentCapacityService;

    const service = new StudentReportService(
      { get: () => undefined } as ConfigService,
      studentCapacityService,
    );

    await expect(service.generateReport('psid-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

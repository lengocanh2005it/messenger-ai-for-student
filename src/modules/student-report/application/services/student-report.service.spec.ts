import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StudentReportNoScoreDataError } from '../../domain/errors/student-report-no-score-data.error';
import {
  StudentReportRetryableError,
  WispaceApiError,
} from '../../domain/errors/wispace-api.error';
import {
  buildStudentReportApiUnavailableMessage,
  buildStudentReportNoScoreDataMessage,
} from '../messages/student-report.messages';
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
      { get: () => undefined } as unknown as ConfigService,
      studentCapacityService,
      { recordFromCompletion: jest.fn() } as never,
      { run: jest.fn((fn: () => unknown) => fn()) } as never,
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
      { get: () => undefined } as unknown as ConfigService,
      studentCapacityService,
      { recordFromCompletion: jest.fn() } as never,
      { run: jest.fn((fn: () => unknown) => fn()) } as never,
    );

    await expect(service.generateReport('psid-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('throws StudentReportRetryableError on Wispace 5xx (R3)', async () => {
    const studentCapacityService = {
      getCapacityData: jest.fn(() =>
        Promise.reject(
          new WispaceApiError(
            'server error',
            503,
            'psid-1',
            'TaskScoreAverage',
          ),
        ),
      ),
    } as unknown as StudentCapacityService;

    const service = new StudentReportService(
      { get: () => undefined } as unknown as ConfigService,
      studentCapacityService,
      { recordFromCompletion: jest.fn() } as never,
      { run: jest.fn((fn: () => unknown) => fn()) } as never,
    );

    await expect(service.generateReport('psid-1')).rejects.toBeInstanceOf(
      StudentReportRetryableError,
    );
  });

  it('returns unavailable message on Wispace 4xx (R3)', async () => {
    const studentCapacityService = {
      getCapacityData: jest.fn(() =>
        Promise.reject(
          new WispaceApiError('not found', 404, 'psid-1', 'User/goals'),
        ),
      ),
    } as unknown as StudentCapacityService;

    const service = new StudentReportService(
      { get: () => undefined } as unknown as ConfigService,
      studentCapacityService,
      { recordFromCompletion: jest.fn() } as never,
      { run: jest.fn((fn: () => unknown) => fn()) } as never,
    );

    await expect(service.generateReport('psid-1')).resolves.toBe(
      buildStudentReportApiUnavailableMessage(),
    );
  });
});

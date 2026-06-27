import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatCompletion } from 'openai/resources/chat/completions';
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
  const capacityInput = {
    exam_date: '2026-07-01',
    exam_date_display: '01/07/2026',
    current_date: '27/06/2026',
    days_until_exam: 4,
    exam_has_passed: false,
    target_band: 7,
    task1_band: 6,
    task2_band: 6.5,
    total_essays_task1: 3,
    total_essays_task2: 5,
  };

  function makeCompletion(content: string): ChatCompletion {
    return {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    } as unknown as ChatCompletion;
  }

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

  it('falls back when LLM returns invalid report JSON shape', async () => {
    const studentCapacityService = {
      getCapacityData: jest.fn(() => Promise.resolve(capacityInput)),
    } as unknown as StudentCapacityService;

    const service = new StudentReportService(
      {
        get: jest.fn((key: string) =>
          key === 'OPENAI_API_KEY' ? 'sk-test' : undefined,
        ),
      } as unknown as ConfigService,
      studentCapacityService,
      { recordFromCompletion: jest.fn() } as never,
      {
        run: jest.fn(() =>
          Promise.resolve(makeCompletion('{"headline":"ok"}')),
        ),
      } as never,
    );

    await expect(service.generateReport('psid-1')).resolves.toContain(
      'Bạn còn 4 ngày nữa',
    );
  });
});

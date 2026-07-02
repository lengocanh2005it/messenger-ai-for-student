import { StudentReportCore } from './student-report.service';
import {
  StudentReportNoScoreDataError,
  type RetryableApiError,
} from './errors';
import type { StudentCapacityInput } from './types';

const baseInput: StudentCapacityInput = {
  exam_date: '2026-08-01',
  exam_date_display: '01/08/2026',
  current_date: '2026-07-01',
  days_until_exam: 31,
  exam_has_passed: false,
  target_band: 7,
  task1_band: 6,
  task2_band: 6.5,
  total_essays_task1: 5,
  total_essays_task2: 4,
};

function makeRetryableError(statusCode: number): RetryableApiError {
  const error = new Error('upstream failed') as RetryableApiError;
  error.statusCode = statusCode;
  error.endpoint = '/task-score-average';
  error.isRetryable = () => statusCode >= 500 && statusCode <= 599;
  return error;
}

describe('StudentReportCore', () => {
  it('returns the no-score-data guidance message without calling the LLM', async () => {
    const llmExecution = { run: jest.fn() };
    const usageRecorder = { recordFromCompletion: jest.fn() };
    const capacityData = {
      getCapacityData: jest
        .fn()
        .mockRejectedValue(new StudentReportNoScoreDataError('user-1')),
    };

    const core = new StudentReportCore(
      { systemPrompt: 'prompt' },
      { llmExecution, usageRecorder, capacityData },
    );

    const result = await core.generateReport('user-1');

    expect(result).toContain('chưa thấy bài Writing nào được chấm');
    expect(llmExecution.run).not.toHaveBeenCalled();
  });

  it('returns a fallback report when OPENAI_API_KEY is missing', async () => {
    const llmExecution = { run: jest.fn() };
    const usageRecorder = { recordFromCompletion: jest.fn() };
    const capacityData = {
      getCapacityData: jest.fn().mockResolvedValue(baseInput),
    };

    const core = new StudentReportCore(
      { systemPrompt: 'prompt' },
      { llmExecution, usageRecorder, capacityData },
    );

    const result = await core.generateReport('user-1');

    expect(result).toContain('còn 31 ngày');
    expect(llmExecution.run).not.toHaveBeenCalled();
  });

  it('throws StudentReportRetryableError on a 5xx capacity fetch error', async () => {
    const llmExecution = { run: jest.fn() };
    const usageRecorder = { recordFromCompletion: jest.fn() };
    const capacityData = {
      getCapacityData: jest.fn().mockRejectedValue(makeRetryableError(503)),
    };

    const core = new StudentReportCore(
      { systemPrompt: 'prompt' },
      { llmExecution, usageRecorder, capacityData },
    );

    await expect(core.generateReport('user-1')).rejects.toMatchObject({
      name: 'StudentReportRetryableError',
      externalUserId: 'user-1',
    });
  });

  it('returns the api-unavailable message on a 4xx capacity fetch error', async () => {
    const llmExecution = { run: jest.fn() };
    const usageRecorder = { recordFromCompletion: jest.fn() };
    const capacityData = {
      getCapacityData: jest.fn().mockRejectedValue(makeRetryableError(404)),
    };

    const core = new StudentReportCore(
      { systemPrompt: 'prompt' },
      { llmExecution, usageRecorder, capacityData },
    );

    const result = await core.generateReport('user-1');
    expect(result).toContain('chưa lấy được đủ dữ liệu học tập');
  });

  it('calls the LLM and records usage when apiKey is configured', async () => {
    const completion = {
      id: 'resp-1',
      choices: [
        {
          message: {
            content: JSON.stringify({
              headline: 'Headline',
              streak: 'Streak',
              'tình trạng task 2': 'T2',
              'tình trạng task 1': 'T1',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const llmExecution = { run: jest.fn().mockResolvedValue(completion) };
    const usageRecorder = { recordFromCompletion: jest.fn() };
    const capacityData = {
      getCapacityData: jest.fn().mockResolvedValue(baseInput),
    };

    const core = new StudentReportCore(
      { apiKey: 'sk-test', systemPrompt: 'prompt' },
      { llmExecution, usageRecorder, capacityData },
    );

    const result = await core.generateReport('user-1');

    expect(result).toBe('Headline\n\nStreak\n\nT2\nT1');
    expect(usageRecorder.recordFromCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'STUDENT_REPORT',
        externalUserId: 'user-1',
        response: completion,
      }),
    );
  });

  it('falls back to a deterministic report when the LLM output is invalid', async () => {
    const completion = {
      id: 'resp-1',
      choices: [{ message: { content: '{}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const llmExecution = { run: jest.fn().mockResolvedValue(completion) };
    const usageRecorder = { recordFromCompletion: jest.fn() };
    const capacityData = {
      getCapacityData: jest.fn().mockResolvedValue(baseInput),
    };

    const core = new StudentReportCore(
      { apiKey: 'sk-test', systemPrompt: 'prompt' },
      { llmExecution, usageRecorder, capacityData },
    );

    const result = await core.generateReport('user-1');
    expect(result).toContain('còn 31 ngày');
  });
});

import {
  buildFallbackReport,
  formatReport,
  parseReportOutput,
} from './report-formatter';
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

describe('parseReportOutput', () => {
  it('parses a valid JSON report', () => {
    const content = JSON.stringify({
      headline: 'Headline',
      streak: 'Streak',
      'tình trạng task 2': 'Task 2 status',
      'tình trạng task 1': 'Task 1 status',
    });

    expect(parseReportOutput(content)).toEqual({
      headline: 'Headline',
      streak: 'Streak',
      'tình trạng task 2': 'Task 2 status',
      'tình trạng task 1': 'Task 1 status',
    });
  });

  it('applies the sanitizeText hook when provided', () => {
    const content = JSON.stringify({
      headline: '**Headline**',
      streak: 'Streak',
      'tình trạng task 2': 'Task 2 status',
      'tình trạng task 1': 'Task 1 status',
    });

    const result = parseReportOutput(content, (raw) =>
      raw.replace(/\*\*/g, ''),
    );

    expect(result.headline).toBe('Headline');
  });

  it('throws when a required field is missing', () => {
    const content = JSON.stringify({ headline: 'Headline' });
    expect(() => parseReportOutput(content)).toThrow(/missing string field/);
  });

  it('throws when content is not a JSON object', () => {
    expect(() => parseReportOutput('[]')).toThrow(
      'LLM JSON output must be an object',
    );
  });
});

describe('buildFallbackReport', () => {
  it('builds an upcoming-exam headline', () => {
    const report = buildFallbackReport(baseInput);
    expect(report.headline).toContain('còn 31 ngày');
  });

  it('builds an exam-day headline', () => {
    const report = buildFallbackReport({ ...baseInput, days_until_exam: 0 });
    expect(report.headline).toContain('Hôm nay là ngày thi');
  });

  it('builds a passed-exam headline', () => {
    const report = buildFallbackReport({
      ...baseInput,
      exam_has_passed: true,
    });
    expect(report.headline).toContain('đã qua');
  });
});

describe('formatReport', () => {
  it('joins report fields with blank lines', () => {
    const text = formatReport({
      headline: 'H',
      streak: 'S',
      'tình trạng task 2': 'T2',
      'tình trạng task 1': 'T1',
    });

    expect(text).toBe('H\n\nS\n\nT2\nT1');
  });
});

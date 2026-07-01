import {
  daysBetweenCalendarDates,
  formatExamDateDisplay,
  parseExamDateToIso,
  rawDaysUntilExam,
  resolveExamCountdown,
} from './exam-date.utils';

describe('exam-date.utils', () => {
  it('computes positive days until exam', () => {
    expect(resolveExamCountdown('2026-06-10', '2026-06-06')).toEqual({
      daysUntilExam: 4,
      examHasPassed: false,
    });
  });

  it('marks exam as passed when current date is after exam date', () => {
    expect(resolveExamCountdown('2026-06-10', '2026-06-14')).toEqual({
      daysUntilExam: 0,
      examHasPassed: true,
    });
  });

  it('treats same-day exam as not passed with zero days left', () => {
    expect(resolveExamCountdown('2026-06-14', '2026-06-14')).toEqual({
      daysUntilExam: 0,
      examHasPassed: false,
    });
  });

  it('formats exam date for user-facing copy', () => {
    expect(formatExamDateDisplay('2026-06-10')).toBe('10/06/2026');
  });

  it('calculates calendar day differences without timezone drift', () => {
    expect(daysBetweenCalendarDates('2026-06-14', '2026-06-10')).toBe(-4);
  });

  it('parses slash, iso date, and iso datetime exam formats', () => {
    expect(parseExamDateToIso('10/06/2026')).toBe('2026-06-10');
    expect(parseExamDateToIso('2026-06-10')).toBe('2026-06-10');
    expect(parseExamDateToIso('2026-06-10T00:00:00.000Z')).toBe('2026-06-10');
  });

  it('computes raw days until exam for cron scheduling', () => {
    expect(rawDaysUntilExam('2026-06-15', '2026-06-14')).toBe(1);
    expect(rawDaysUntilExam('2026-06-10', '2026-06-14')).toBe(-4);
  });
});

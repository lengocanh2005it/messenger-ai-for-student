import {
  daysBetweenCalendarDates,
  formatExamDateDisplay,
  resolveExamCountdown,
} from './exam-date.utils';

describe('exam-date.utils', () => {
  it('computes positive days until exam', () => {
    expect(
      resolveExamCountdown('2026-06-10', '2026-06-06'),
    ).toEqual({
      daysUntilExam: 4,
      examHasPassed: false,
    });
  });

  it('marks exam as passed when current date is after exam date', () => {
    expect(
      resolveExamCountdown('2026-06-10', '2026-06-14'),
    ).toEqual({
      daysUntilExam: 0,
      examHasPassed: true,
    });
  });

  it('treats same-day exam as not passed with zero days left', () => {
    expect(
      resolveExamCountdown('2026-06-14', '2026-06-14'),
    ).toEqual({
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
});

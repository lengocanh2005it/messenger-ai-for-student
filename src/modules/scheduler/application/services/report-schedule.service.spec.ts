import { ReportScheduleService } from './report-schedule.service';

describe('ReportScheduleService.calculateDaysUntilExam (R5)', () => {
  const service = Object.create(
    ReportScheduleService.prototype,
  ) as ReportScheduleService;

  it('returns 1 on day before exam — retry still allowed', () => {
    const days = service.calculateDaysUntilExam(
      '2026-06-15',
      new Date('2026-06-14T08:00:00+07:00'),
    );
    expect(days).toBe(1);
  });

  it('returns -1 after exam day — outbox should expire', () => {
    const days = service.calculateDaysUntilExam(
      '2026-06-15',
      new Date('2026-06-16T08:00:00+07:00'),
    );
    expect(days).toBe(-1);
  });
});

import { ConfigService } from '@nestjs/config';
import { ReportScheduleService } from './report-schedule.service';

describe('ReportScheduleService.calculateDaysUntilExam (R5)', () => {
  const config = {
    get: (key: string) =>
      key === 'CHAT_USAGE_TIMEZONE' ? 'Asia/Ho_Chi_Minh' : undefined,
  } as ConfigService;

  const service = new ReportScheduleService(config, {
    getUserGoals: jest.fn(),
    parseExamDate: jest.fn(),
  } as never);

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

  it('uses Vietnam calendar date near midnight UTC, not server-local day', () => {
    const days = service.calculateDaysUntilExam(
      '2026-06-15',
      new Date('2026-06-13T18:00:00Z'),
    );
    expect(days).toBe(1);
  });
});

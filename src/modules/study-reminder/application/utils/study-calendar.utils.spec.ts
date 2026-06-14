import {
  buildEventDateIso,
  formatEventDateForApiWrite,
  formatStoredCalendarDate,
  getTomorrowLocalDate,
  resolveRescheduleSlot,
} from './study-calendar.utils';

describe('study-calendar.utils', () => {
  const timezone = 'Asia/Ho_Chi_Minh';
  const now = new Date('2026-06-10T10:00:00+07:00');

  it('keeps local eventDate for internal reschedule slot', () => {
    expect(buildEventDateIso('2026-06-11')).toBe('2026-06-11');
  });

  it('formats eventDate as UTC for UserCalendar POST', () => {
    expect(formatEventDateForApiWrite('2026-06-13')).toBe(
      '2026-06-13T00:00:00Z',
    );
  });

  it('defaults reschedule to same time on day after source session', () => {
    expect(
      resolveRescheduleSlot({
        schedulingMode: 'default_next_day_same_time',
        sourceEventDate: '2026-06-10T00:00:00Z',
        sourceTime: '8:30',
        timezone,
        now,
      }),
    ).toEqual({
      eventDate: '2026-06-11',
      time: '08:30',
      localDate: '2026-06-11',
      schedulingMode: 'default_next_day_same_time',
    });
  });

  it('parses Wispace date-only sourceEventDate', () => {
    const now = new Date('2026-06-11T10:00:00+07:00');

    expect(
      resolveRescheduleSlot({
        schedulingMode: 'default_next_day_same_time',
        sourceEventDate: '2026-06-12',
        sourceTime: '08:00',
        timezone,
        now,
      }),
    ).toMatchObject({
      eventDate: '2026-06-13',
      localDate: '2026-06-13',
      time: '08:00',
    });
  });

  it('moves tomorrow session to day after tomorrow', () => {
    const now = new Date('2026-06-11T10:00:00+07:00');

    expect(
      resolveRescheduleSlot({
        schedulingMode: 'default_next_day_same_time',
        sourceEventDate: '2026-06-12T00:00:00Z',
        sourceTime: '08:00',
        timezone,
        now,
      }),
    ).toMatchObject({
      localDate: '2026-06-13',
      time: '08:00',
    });
  });

  it('uses explicit date and time when provided', () => {
    expect(
      resolveRescheduleSlot({
        schedulingMode: 'explicit',
        sourceEventDate: '2026-06-10T00:00:00Z',
        sourceTime: '08:30',
        newLocalDate: '2026-06-12',
        newTime: '09:00',
        timezone,
        now,
      }),
    ).toEqual({
      eventDate: '2026-06-12',
      time: '09:00',
      localDate: '2026-06-12',
      schedulingMode: 'explicit',
    });
  });

  it('keeps source time when only explicit date is provided', () => {
    expect(
      resolveRescheduleSlot({
        schedulingMode: 'explicit',
        sourceEventDate: '2026-06-10T00:00:00Z',
        sourceTime: '08:30',
        newLocalDate: '2026-06-13',
        timezone,
        now,
      }),
    ).toMatchObject({
      localDate: '2026-06-13',
      time: '08:30',
    });
  });

  it('uses tomorrow when only explicit time is provided', () => {
    expect(
      resolveRescheduleSlot({
        schedulingMode: 'explicit',
        sourceEventDate: '2026-06-10T00:00:00Z',
        sourceTime: '08:30',
        newTime: '09:00',
        timezone,
        now,
      }),
    ).toMatchObject({
      localDate: getTomorrowLocalDate(timezone, now),
      time: '09:00',
    });
  });

  it('formats stored DB timestamps using Vietnam calendar date', () => {
    expect(
      formatStoredCalendarDate(
        new Date('2026-06-14T17:00:00.000Z'),
        timezone,
      ),
    ).toBe('2026-06-15');
  });
});

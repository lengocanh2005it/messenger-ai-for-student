import {
  normalizeCreatedCalendarRecord,
  normalizeUserCalendarRecord,
  normalizeUserCalendarRecords,
} from './user-calendar-record.normalizer';

describe('user-calendar-record.normalizer', () => {
  it('normalizes Wispace UserCalendar item', () => {
    expect(
      normalizeUserCalendarRecord({
        id: 11248,
        userId: 143,
        eventDate: '2026-06-12',
        time: '08:00',
        createdAt: '2026-06-11T14:55:51.197767Z',
      }),
    ).toEqual({
      id: 11248,
      userId: 143,
      eventDate: '2026-06-12',
      time: '08:00',
      createdAt: '2026-06-11T14:55:51.197767Z',
    });
  });

  it('normalizes create response wrapped in data', () => {
    expect(
      normalizeCreatedCalendarRecord(
        {
          data: {
            id: 11252,
            userId: 143,
            eventDate: '2026-06-13',
            time: '08:00',
          },
        },
        { eventDate: '2026-06-13', time: '08:00', userId: 143 },
      ),
    ).toMatchObject({
      id: 11252,
      eventDate: '2026-06-13',
      time: '08:00',
    });
  });

  it('normalizes create response with id only', () => {
    expect(
      normalizeCreatedCalendarRecord(
        { id: 11253 },
        { eventDate: '2026-06-14', time: '08:00', userId: 143 },
      ),
    ).toEqual({
      id: 11253,
      userId: 143,
      eventDate: '2026-06-14',
      time: '08:00',
      createdAt: undefined,
    });
  });

  it('normalizes list response wrapper', () => {
    expect(
      normalizeUserCalendarRecords({
        data: [
          {
            id: 1,
            userId: 143,
            eventDate: '2026-06-22',
            time: '08:00',
          },
        ],
        count: 1,
      }),
    ).toHaveLength(1);
  });
});

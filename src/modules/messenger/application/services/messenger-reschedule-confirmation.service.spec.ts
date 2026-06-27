import { MessengerRescheduleConfirmationService } from './messenger-reschedule-confirmation.service';
import { StudyCalendarCommandService } from '../../../study-reminder/application/services/study-calendar-command.service';

describe('MessengerRescheduleConfirmationService', () => {
  const createService = (
    calendar: StudyCalendarCommandService['listEntries'],
    reschedule: StudyCalendarCommandService['rescheduleSession'],
  ) => {
    const studyCalendarCommandService = {
      listEntries: calendar,
      rescheduleSession: reschedule,
    } as StudyCalendarCommandService;

    return new MessengerRescheduleConfirmationService(
      studyCalendarCommandService,
    );
  };

  it('stages pending reschedule with confirm buttons', async () => {
    const service = createService(
      jest.fn(() =>
        Promise.resolve({
          timeRange: 'upcoming' as const,
          entries: [
            {
              calendarId: 42,
              eventDate: '2026-06-28',
              time: '09:00',
              scheduledTimeLabel: 'Ngày mai lúc 09:00',
              topic: 'IELTS Writing',
            },
          ],
        }),
      ),
      jest.fn(),
    );

    const result = await service.stage({
      psid: 'psid-1',
      userId: 143,
      calendarId: 42,
      schedulingMode: 'default_next_day_same_time',
    });

    expect(result).toMatchObject({
      pendingConfirmation: true,
      sessionLabel: 'Ngày mai lúc 09:00',
    });
    if (!('richFollowUp' in result)) {
      throw new Error('expected staged reschedule result');
    }
    expect(result.richFollowUp.kind).toBe('button');
    const followUp = result.richFollowUp as { kind: 'button'; buttons: unknown[] };
    expect(followUp.buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ payload: 'CONFIRM_RESCHEDULE' }),
        expect.objectContaining({ payload: 'CANCEL_RESCHEDULE' }),
      ]),
    );
  });

  it('confirms staged reschedule', async () => {
    const reschedule = jest.fn(() =>
      Promise.resolve({
        schedulingMode: 'default_next_day_same_time' as const,
        cancelledCalendarId: 42,
        created: { id: 99, userId: 143, eventDate: '2026-06-29', time: '09:00' },
        scheduledTimeLabel: 'Ngày kia lúc 09:00',
        outboxSyncQueued: true,
      }),
    );

    const service = createService(
      jest.fn(() =>
        Promise.resolve({
          timeRange: 'upcoming' as const,
          entries: [
            {
              calendarId: 42,
              eventDate: '2026-06-28',
              time: '09:00',
              scheduledTimeLabel: 'Ngày mai lúc 09:00',
              topic: 'IELTS Writing',
            },
          ],
        }),
      ),
      reschedule,
    );

    await service.stage({
      psid: 'psid-1',
      userId: 143,
      calendarId: 42,
      schedulingMode: 'default_next_day_same_time',
    });

    const confirmed = await service.confirm('psid-1', 143);

    expect(confirmed).toEqual({
      confirmed: true,
      scheduledTimeLabel: 'Ngày kia lúc 09:00',
    });
    expect(reschedule).toHaveBeenCalledWith({
      psid: 'psid-1',
      userId: 143,
      calendarId: 42,
      schedulingMode: 'default_next_day_same_time',
      newLocalDate: undefined,
      newTime: undefined,
    });
  });

  it('rejects confirm when nothing pending', async () => {
    const service = createService(jest.fn(), jest.fn());

    const result = await service.confirm('psid-1', 143);

    expect(result.confirmed).toBe(false);
  });
});

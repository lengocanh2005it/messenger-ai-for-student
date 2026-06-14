import { MessengerApiError } from '../../../messenger/application/services/messenger-outbound.service';
import { shouldSkipProactiveRetries } from '../../../messenger/application/utils/proactive-send.utils';
import { StudyReminderDispatchService } from './study-reminder-dispatch.service';

describe('StudyReminderDispatchService', () => {
  it('treats Messenger 24h window as terminal failure without retry (L2)', () => {
    const error = new MessengerApiError(
      'Send failed',
      400,
      'Bad Request',
      '{"error":{"code":10}}',
    );

    expect(shouldSkipProactiveRetries(error)).toBe(true);
  });

  it('service is constructible with mocked deps', () => {
    const service = new StudyReminderDispatchService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(service).toBeInstanceOf(StudyReminderDispatchService);
  });
});

import { MessengerApiError } from '../services/messenger-outbound.service';
import { isProactiveMessenger24hError } from './proactive-send.utils';

describe('proactive-send.utils', () => {
  it('isProactiveMessenger24hError delegates to chat 24h detector (L2)', () => {
    const error = new MessengerApiError(
      'Send failed',
      400,
      'Bad Request',
      '{"error":{"code":10,"message":"(#10) Outside the allowed window"}}',
    );

    expect(isProactiveMessenger24hError(error)).toBe(true);
  });
});

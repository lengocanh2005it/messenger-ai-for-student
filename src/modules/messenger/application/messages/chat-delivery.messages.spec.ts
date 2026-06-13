import { MessengerApiError } from '../services/messenger-outbound.service';
import {
  buildChatDeliveryErrorMessage,
  buildUnsupportedMessageTypeReply,
  isMessenger24hWindowError,
} from './chat-delivery.messages';

describe('chat-delivery.messages', () => {
  it('detects Meta 24h messaging window errors', () => {
    const error = new MessengerApiError(
      'Send failed',
      400,
      'Bad Request',
      '{"error":{"code":10,"message":"(#10) Outside the allowed window"}}',
    );

    expect(isMessenger24hWindowError(error)).toBe(true);
    expect(buildChatDeliveryErrorMessage(error)).toContain('24 giờ');
  });

  it('uses generic fallback for non-window errors', () => {
    const error = new MessengerApiError(
      'Send failed',
      500,
      'Internal Server Error',
      '{"error":{"code":1}}',
    );

    expect(isMessenger24hWindowError(error)).toBe(false);
    expect(buildChatDeliveryErrorMessage(error)).toContain('thử gửi lại');
  });

  it('buildUnsupportedMessageTypeReply guides user to send text (L1)', () => {
    expect(buildUnsupportedMessageTypeReply()).toContain('tin nhắn chữ');
  });
});

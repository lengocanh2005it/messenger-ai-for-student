import { MessengerApiError } from '../services/messenger-outbound.service';
import {
  buildChatDeliveryErrorMessage,
  buildUnsupportedMessageTypeReply,
  isMessenger24hWindowError,
  isMessengerSenderActionError,
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

  it('does not treat sender action failed (#100 / 2018048) as 24h window', () => {
    const error = new MessengerApiError(
      'Send failed',
      400,
      'Bad Request',
      '{"error":{"message":"(#100) Sender action failed","type":"OAuthException","code":100,"error_subcode":2018048}}',
    );

    expect(isMessengerSenderActionError(error)).toBe(true);
    expect(isMessenger24hWindowError(error)).toBe(false);
    expect(buildChatDeliveryErrorMessage(error)).toContain('thử gửi lại');
  });

  it('detects 24h window via error_subcode 2018278', () => {
    const error = new MessengerApiError(
      'Send failed',
      400,
      'Bad Request',
      '{"error":{"code":10,"error_subcode":2018278,"message":"(#10) This message is sent outside of the allowed window."}}',
    );

    expect(isMessenger24hWindowError(error)).toBe(true);
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

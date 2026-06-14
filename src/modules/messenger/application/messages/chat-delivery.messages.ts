import { MessengerApiError } from '../services/messenger-outbound.service';

const MESSAGING_WINDOW_MARKERS = [
  'outside of the allowed window',
  'outside the allowed window',
  '24 hour',
  '24-hour',
  'messaging window',
  '(#10)',
  '"code":10',
  '"code": 10',
  '2018278',
] as const;

export function isMessenger24hWindowError(error: unknown): boolean {
  if (!(error instanceof MessengerApiError)) {
    return false;
  }

  const haystack = `${error.message} ${error.responseBody}`.toLowerCase();
  return MESSAGING_WINDOW_MARKERS.some((marker) =>
    haystack.includes(marker.toLowerCase()),
  );
}

export function buildChatDeliveryErrorMessage(error: unknown): string {
  if (isMessenger24hWindowError(error)) {
    return (
      'Facebook chỉ cho phép bot trả lời trong vòng 24 giờ kể từ lần bạn nhắn gần nhất. ' +
      'Bạn mở lại cuộc chat với WISPACE và gửi một tin ngắn để tiếp tục nhé.'
    );
  }

  return 'Xin lỗi, mình chưa xử lý được tin nhắn. Bạn thử gửi lại sau giây lát nhé.';
}

/** H5: webhook text thiếu message.mid khi bật rate limit. */
export function buildChatMissingMidMessage(): string {
  return (
    'Mình chưa nhận diện được tin nhắn này. ' +
    'Bạn thử gửi lại một tin ngắn giúp mình nhé.'
  );
}

/** L1: sticker / ảnh / file — bot chỉ xử lý tin chữ. */
export function buildUnsupportedMessageTypeReply(): string {
  return (
    'Mình chỉ đọc được tin nhắn chữ thôi nhé. ' +
    'Bạn gửi lại câu hỏi bằng chữ để mình hỗ trợ bạn.'
  );
}

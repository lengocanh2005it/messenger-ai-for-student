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

function isOpenAiRateLimitError(error: unknown): boolean {
  if (error instanceof MessengerApiError) return false;
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  if (e['name'] === 'RateLimitError') return true;
  if (
    e['status'] === 429 &&
    typeof e['message'] === 'string' &&
    /openai|rate.?limit/i.test(e['message'])
  )
    return true;
  return false;
}

function isOpenAiServerError(error: unknown): boolean {
  if (error instanceof MessengerApiError) return false;
  if (typeof error !== 'object' || error === null) return false;
  const e = error as Record<string, unknown>;
  if (e['name'] === 'InternalServerError' || e['name'] === 'APIConnectionError')
    return true;
  const status = e['status'];
  return typeof status === 'number' && status >= 500 && status < 600;
}

export function buildChatDeliveryErrorMessage(error: unknown): string {
  if (isMessenger24hWindowError(error)) {
    return (
      'Facebook chỉ cho phép bot trả lời trong vòng 24 giờ kể từ lần bạn nhắn gần nhất. ' +
      'Bạn mở lại cuộc chat với WISPACE và gửi một tin ngắn để tiếp tục nhé.'
    );
  }

  if (isOpenAiRateLimitError(error)) {
    return 'Trợ lý AI đang quá tải, bạn thử lại sau 1–2 phút nhé.';
  }

  if (isOpenAiServerError(error)) {
    return 'Trợ lý AI tạm thời gặp sự cố, bạn thử lại sau giây lát nhé.';
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

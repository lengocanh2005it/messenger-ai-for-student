import { NotificationCadence } from '../../modules/messenger/domain/entities/messenger.types';

const VALID_CADENCES: NotificationCadence[] = ['DAILY', 'WEEKLY', 'MONTHLY'];

/** Defaults when Messenger webhook only sends ref (Get Started / m.me). */
export const POC_DEFAULT_LINK_TOPIC = 'IELTS';

/** Default study-session topic when the Wispace calendar record has none. */
export const DEFAULT_TOPIC = 'IELTS Writing';
export const POC_DEFAULT_LINK_CADENCE: NotificationCadence = 'WEEKLY';

export interface MessengerLinkContext {
  ref: string;
  topic: string;
  cadence: NotificationCadence;
  userId: number;
}

export function parseUserIdFromRef(ref?: string | null): number | undefined {
  if (!ref?.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(ref.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function isValidCadence(
  value?: string | null,
): value is NotificationCadence {
  return (
    !!value &&
    VALID_CADENCES.includes(value.trim().toUpperCase() as NotificationCadence)
  );
}

export function normalizeCadence(value: string): NotificationCadence {
  return value.trim().toUpperCase() as NotificationCadence;
}

export function parseMessengerLinkContext(input: {
  ref?: string | null;
  topic?: string | null;
  cadence?: string | null;
}): MessengerLinkContext | undefined {
  const ref = input.ref?.trim();
  const userId = parseUserIdFromRef(ref);
  if (!userId) {
    return undefined;
  }

  const topic = input.topic?.trim() || POC_DEFAULT_LINK_TOPIC;
  const cadenceInput = input.cadence?.trim() || POC_DEFAULT_LINK_CADENCE;

  if (!isValidCadence(cadenceInput)) {
    return undefined;
  }

  return {
    ref: ref!,
    topic,
    cadence: normalizeCadence(cadenceInput),
    userId,
  };
}

export function parseUserIdFromPayload(payload?: string): number | undefined {
  if (!payload) {
    return undefined;
  }

  const refMatch = /(?:^|[;,]\s*)ref[:=](\d+)/i.exec(payload);
  if (refMatch) {
    return parseUserIdFromRef(refMatch[1]);
  }

  return undefined;
}

export function buildPocPsidToken(psid: string): string {
  return `poc:psid:${psid}`;
}

export function buildMMeLink(
  pageRef: string,
  context: MessengerLinkContext,
): string {
  const url = new URL(`https://m.me/${pageRef}`);
  url.searchParams.set('topic', context.topic);
  url.searchParams.set('cadence', context.cadence);
  url.searchParams.set('ref', context.ref);
  return url.toString();
}

export const FALLBACK_DISPLAY_NAME = 'Chào bạn nha';

export function buildWelcomeMessage(
  displayName: string = FALLBACK_DISPLAY_NAME,
): string {
  const name = displayName.trim();
  if (!name || name === FALLBACK_DISPLAY_NAME) {
    return `Chào bạn nha! Mình là trợ lý WISPACE. Bạn có thể hỏi về tiến độ học, lịch học sắp tới, hoặc đăng ký báo cáo trước ngày thi — cứ nhắn tự nhiên nhé.`;
  }

  return `Chào ${name}! Mình là trợ lý WISPACE. Bạn có thể hỏi về tiến độ học, lịch học sắp tới, hoặc đăng ký báo cáo trước ngày thi — cứ nhắn tự nhiên nhé.`;
}

export function getPocSubscriptionConfirmationMessage(): string {
  return 'Bạn đã đăng ký nhận báo cáo học tập. WISPACE sẽ gửi báo cáo AI qua Messenger khoảng 2–3 ngày trước ngày thi của bạn.';
}

export function getPocAlreadySubscribedMessage(): string {
  return 'Bạn đã đăng ký nhận báo cáo học tập rồi. WISPACE sẽ gửi báo cáo AI khoảng 2–3 ngày trước ngày thi — không cần bấm lại.';
}

export function getMissingUserRefMessage(): string {
  return 'Vui lòng mở Messenger từ liên kết WISPACE (có đủ topic, cadence và ref) để kết nối tài khoản trước khi sử dụng.';
}

export function isPocPsidToken(token: string): boolean {
  return token.startsWith('poc:psid:');
}

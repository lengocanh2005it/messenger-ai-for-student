import { NotificationCadence } from '../messenger/types';

/** POC: chưa có đăng nhập — hardcode toàn bộ tham số recurring notification. */
export const POC_USER_ID = 436;
export const POC_TOPIC = 'ai_capacity_report';
export const POC_CADENCE: NotificationCadence = 'DAILY';

export function resolvePocUserId(userId?: number | null): number {
  if (userId && userId > 0) {
    return userId;
  }

  return POC_USER_ID;
}

export function buildPocPsidToken(psid: string): string {
  return `poc:psid:${psid}`;
}

export function getPocMMeLink(pageRef: string, userId: number = POC_USER_ID): string {
  const url = new URL(`https://m.me/${pageRef}`);
  url.searchParams.set('ref', String(userId));
  return url.toString();
}

export function getPocSubscriptionConfirmationMessage(): string {
  return 'Bạn đã đăng ký nhận báo cáo học tập. WISPACE sẽ gửi báo cáo AI qua Messenger khoảng 2–3 ngày trước ngày thi của bạn.';
}

export function getPocAlreadySubscribedMessage(): string {
  return 'Bạn đã đăng ký nhận báo cáo học tập rồi. WISPACE sẽ gửi báo cáo AI khoảng 2–3 ngày trước ngày thi — không cần bấm lại.';
}

export function isPocPsidToken(token: string): boolean {
  return token.startsWith('poc:psid:');
}

export function parseOptinUserId(ref?: string): number {
  if (!ref) {
    return POC_USER_ID;
  }

  const parsed = Number.parseInt(ref, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : POC_USER_ID;
}

export function parseOptinUserIdFromPayload(payload?: string): number {
  if (!payload) {
    return POC_USER_ID;
  }

  const refMatch = /(?:^|[;,]\s*)ref[:=](\d+)/i.exec(payload);
  if (refMatch) {
    return parseOptinUserId(refMatch[1]);
  }

  return POC_USER_ID;
}

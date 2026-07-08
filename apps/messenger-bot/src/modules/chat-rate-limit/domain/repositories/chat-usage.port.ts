import type { IncrementDailyUsageInput } from '../entities/chat-daily-usage.types';

export const CHAT_USAGE_PORT = Symbol('CHAT_USAGE_PORT');

export interface ChatUsagePort {
  getDailyUsageCount(psid: string, usageDate: string): Promise<number>;
  incrementDailyUsage(input: IncrementDailyUsageInput): Promise<number>;
  decrementDailyUsage(psid: string, usageDate: string): Promise<number | null>;
}

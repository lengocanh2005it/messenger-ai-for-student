export const CHAT_OPS_PORT = Symbol('CHAT_OPS_PORT');

export interface ChatOpsPort {
  countStuckReserved(stuckBefore: Date): Promise<number>;
  countIdempotencyByStatusForUsageDate(
    usageDate: string,
  ): Promise<Record<string, number>>;
  countUsersAtOrAboveDailyLimit(
    usageDate: string,
    dailyLimit: number,
  ): Promise<number>;
}

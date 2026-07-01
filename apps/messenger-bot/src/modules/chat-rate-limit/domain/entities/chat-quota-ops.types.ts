export interface ChatQuotaOpsSummary {
  usageDate: string;
  stuckReserved: number;
  stuckReservedMs: number;
  denyLogs24h: number;
  usersAtDailyLimit: number;
  dailyLimit: number;
  idempotencyByStatus: Record<string, number>;
  logGrepHints: string[];
}

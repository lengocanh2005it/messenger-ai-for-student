export interface ChatDailyUsage {
  id: number;
  psid: string;
  userId?: number;
  usageDate: string;
  freeFormCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncrementDailyUsageInput {
  psid: string;
  userId?: number;
  usageDate: string;
}

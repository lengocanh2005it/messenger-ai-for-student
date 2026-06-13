export interface SendScheduledReportsOptions {
  /** Ops: bỏ qua cửa sổ 2–3 ngày trước thi. Cron 08:00 luôn false. */
  forceSend?: boolean;
  /** Ops: chỉ gửi một PSID (mapping subscribe active). */
  psid?: string;
  /**
   * Ops: gửi lại dù đã có SCHEDULED_LEARNING_REPORT hôm nay.
   * Mặc định false — tránh trùng báo cáo proactive (R5).
   */
  allowDuplicate?: boolean;
}

export interface SendScheduledReportsResult {
  total: number;
  sent: number;
  skipped: number;
  deferred: number;
  windowClosed: number;
  claimSkipped: number;
  retryQueued: number;
  failed: number;
  schedule: {
    minDays: number;
    maxDays: number;
  };
  failures: Array<{ token: string; error: string }>;
}

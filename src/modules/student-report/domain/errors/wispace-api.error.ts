export class WispaceApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly psid: string,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = 'WispaceApiError';
  }

  isRetryable(): boolean {
    return this.statusCode >= 500 && this.statusCode <= 599;
  }
}

/** R3: Wispace 5xx — cron defer; menu có thể gửi tin “thử lại sau”. */
export class StudentReportRetryableError extends Error {
  constructor(
    readonly psid: string,
    readonly cause: WispaceApiError,
  ) {
    super(cause.message);
    this.name = 'StudentReportRetryableError';
  }
}

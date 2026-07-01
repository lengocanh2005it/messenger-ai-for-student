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

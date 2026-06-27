export { WispaceApiError } from '../../../../shared/errors/wispace-api.error';

import { WispaceApiError } from '../../../../shared/errors/wispace-api.error';

/** R3: Wispace 5xx — cron defer; menu có thể gửi tin "thử lại sau". */
export class StudentReportRetryableError extends Error {
  constructor(
    readonly psid: string,
    readonly cause: WispaceApiError,
  ) {
    super(cause.message);
    this.name = 'StudentReportRetryableError';
  }
}

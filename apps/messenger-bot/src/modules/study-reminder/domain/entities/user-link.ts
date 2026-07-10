/**
 * Lightweight DTO for user-link data consumed by study-reminder.
 * Decouples study-reminder from the full UserMessengerMapping entity.
 */
export interface UserLink {
  psid?: string;
  userId?: number;
  cadence?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  topic?: string;
}

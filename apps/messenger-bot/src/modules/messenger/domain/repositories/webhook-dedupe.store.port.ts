export const WEBHOOK_DEDUPE_STORE = Symbol('WEBHOOK_DEDUPE_STORE');

export interface WebhookDedupeStorePort {
  /** Returns true when the message mid was already processed recently. */
  isDuplicateMessageMid(mid: string, psid: string): Promise<boolean>;
  /** Returns true when the same postback was already processed recently. */
  isDuplicatePostback(psid: string, payload: string): Promise<boolean>;
}

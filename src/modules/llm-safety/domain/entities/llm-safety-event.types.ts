export interface InsertLlmSafetyEvent {
  feature: string;
  eventType: string;
  reason?: string;
  psid?: string;
  userId?: number;
  correlationId?: string;
  payload?: Record<string, unknown>;
}

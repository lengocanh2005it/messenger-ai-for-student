export interface InsertLlmSafetyEvent {
  feature: string;
  eventType: string;
  reason?: string;
  externalUserId?: string;
  userId?: number;
  correlationId?: string;
  payload?: Record<string, unknown>;
}

export interface RecordGroundingWarningInput {
  externalUserId: string;
  userId?: number;
  correlationId?: string;
  reason: string;
  userTextPreview?: string;
  assistantTextPreview?: string;
  toolNamesUsed: string[];
}

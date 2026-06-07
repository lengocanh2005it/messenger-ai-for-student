export type NotificationCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface MessengerReferral {
  ref?: string;
  source?: string;
  type?: string;
}

export interface MessengerOptin {
  type?: string;
  notification_messages_token?: string;
  notification_messages_status?: string;
  topic?: string;
  frequency?: NotificationCadence;
  ref?: string;
}

export interface MessengerWebhookEvent {
  sender?: {
    id?: string;
  };
  message?: {
    text?: string;
  };
  postback?: {
    payload?: string;
    referral?: MessengerReferral;
  };
  referral?: MessengerReferral;
  optin?: MessengerOptin;
}

export interface MessengerWebhookPayload {
  object?: string;
  entry?: Array<{
    messaging?: MessengerWebhookEvent[];
  }>;
}

export interface UserMessengerMapping {
  id: number;
  userId?: number;
  psid?: string;
  notificationMessagesToken: string;
  cadence?: NotificationCadence;
  topic?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface MessengerMessageLog {
  id: number;
  userId?: number;
  psid?: string;
  messageType: string;
  messageText: string;
  status: 'SENT' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
}

import {
  MessengerMessageLog,
  NotificationCadence,
  UserMessengerMapping,
} from '../entities/messenger.types';

export const MESSENGER_REPOSITORY = Symbol('MESSENGER_REPOSITORY');

export interface MessengerRepositoryPort {
  findActiveMappingByPsid(psid: string): Promise<UserMessengerMapping | null>;
  findActiveMappingByUserId(
    userId: number,
  ): Promise<UserMessengerMapping | null>;
  upsertPsidUserLink(params: {
    psid: string;
    userId: number;
    topic?: string;
    cadence?: NotificationCadence;
  }): Promise<UserMessengerMapping>;
  upsertPocSubscription(params: {
    psid: string;
    userId: number;
    cadence: NotificationCadence;
    topic: string;
    notificationMessagesToken: string;
  }): Promise<UserMessengerMapping>;
  findActiveMappingsForCadence(
    cadence: NotificationCadence,
  ): Promise<UserMessengerMapping[]>;
  findActiveSubscribedMappings(): Promise<UserMessengerMapping[]>;
  findActiveMappingsWithPsid(): Promise<UserMessengerMapping[]>;
  cleanupActiveDuplicateMappings(): Promise<number>;
  hasSentScheduledReportToday(psid: string): Promise<boolean>;
  logMessage(params: {
    userId?: number;
    psid?: string;
    messageType: string;
    messageText: string;
    status: 'SENT' | 'FAILED';
    errorMessage?: string;
  }): Promise<MessengerMessageLog>;
}

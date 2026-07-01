import { UserMessengerMapping } from '../../../messenger/domain/entities/messenger.types';

export const MESSENGER_MAPPING_READER = Symbol('MESSENGER_MAPPING_READER');

export interface MessengerMappingReaderPort {
  findActiveMappingByPsid(psid: string): Promise<UserMessengerMapping | null>;
  findActiveMappingByUserId(
    userId: number,
  ): Promise<UserMessengerMapping | null>;
  findActiveMappingsWithPsid(): Promise<UserMessengerMapping[]>;
}

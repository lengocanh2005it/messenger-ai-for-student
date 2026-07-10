import type { UserLink } from '../../domain/entities/user-link';

export const MESSENGER_MAPPING_READER = Symbol('MESSENGER_MAPPING_READER');

export interface MessengerMappingReaderPort {
  findActiveMappingByPsid(psid: string): Promise<UserLink | null>;
  findActiveMappingByUserId(userId: number): Promise<UserLink | null>;
  findActiveMappingsWithPsid(): Promise<UserLink[]>;
}

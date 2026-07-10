import type { MessengerMappingRepositoryPort } from './messenger-mapping.repository.port';
import type { MessengerMessageLogRepositoryPort } from './messenger-message-log.repository.port';
import type { ReportClaimRepositoryPort } from './report-claim.repository.port';

export const MESSENGER_REPOSITORY = Symbol('MESSENGER_REPOSITORY');

/**
 * Full repository port — extends 3 focused ports for backward compatibility.
 * New consumers should import the focused ports directly.
 */
export interface MessengerRepositoryPort
  extends
    MessengerMappingRepositoryPort,
    MessengerMessageLogRepositoryPort,
    ReportClaimRepositoryPort {}

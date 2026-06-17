import { Inject, Injectable, Logger } from '@nestjs/common';
import { MessengerLinkContext } from '../../../../shared/config/poc.constants';
import { StudyReminderSyncService } from '../../../study-reminder/application/services/study-reminder-sync.service';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import { UserMessengerMapping } from '../../domain/entities/messenger.types';
import {
  buildMappingUserIdRelinkedMessage,
  buildMappingRelinkBlockedMessage,
} from '../messages/messenger-link.messages';
import { MessengerOutboundService } from './messenger-outbound.service';

export interface RelinkMappingResult {
  mapping: UserMessengerMapping;
  relinked: boolean;
  blocked?: boolean;
  previousUserId?: number;
  syncedStudyReminders: boolean;
}

@Injectable()
export class MessengerMappingService {
  private readonly logger = new Logger(MessengerMappingService.name);

  constructor(
    @Inject(MESSENGER_REPOSITORY)
    private readonly repository: MessengerRepositoryPort,
    private readonly outbound: MessengerOutboundService,
    private readonly studyReminderSyncService: StudyReminderSyncService,
  ) {}

  async linkFromContext(
    psid: string,
    context: MessengerLinkContext,
    options?: {
      notifyUser?: boolean;
      syncStudyReminders?: boolean;
      allowRelink?: boolean;
    },
  ): Promise<RelinkMappingResult> {
    return this.relinkPsidToUserId({
      psid,
      userId: context.userId,
      topic: context.topic,
      cadence: context.cadence,
      notifyUser: options?.notifyUser ?? true,
      syncStudyReminders: options?.syncStudyReminders ?? true,
      allowRelink: options?.allowRelink ?? false,
    });
  }

  async relinkPsidToUserId(params: {
    psid: string;
    userId: number;
    topic?: string;
    cadence?: MessengerLinkContext['cadence'];
    notifyUser?: boolean;
    syncStudyReminders?: boolean;
    allowRelink?: boolean;
  }): Promise<RelinkMappingResult> {
    const existing = await this.repository.findActiveMappingByPsid(params.psid);
    const previousUserId = existing?.userId;
    const relinked = previousUserId != null && previousUserId !== params.userId;

    if (relinked && !params.allowRelink) {
      this.logger.warn(
        `MAPPING_RELINK_BLOCKED psid=${params.psid} from=${previousUserId} to=${params.userId}`,
      );

      if (params.notifyUser !== false) {
        await this.outbound.sendTextViaPsid({
          psid: params.psid,
          userId: previousUserId ?? undefined,
          text: buildMappingRelinkBlockedMessage(),
          messageType: 'MAPPING_RELINK_BLOCKED',
        });
      }

      return {
        mapping: existing!,
        relinked: false,
        blocked: true,
        previousUserId,
        syncedStudyReminders: false,
      };
    }
    const mapping = await this.repository.upsertPsidUserLink({
      psid: params.psid,
      userId: params.userId,
      topic: params.topic,
      cadence: params.cadence,
    });

    if (relinked) {
      this.logger.warn(
        `MAPPING_USER_ID_RELINK psid=${params.psid} from=${previousUserId} to=${params.userId}`,
      );
    } else {
      this.logger.log(
        `Linked PSID ${params.psid} to userId=${params.userId}, topic=${params.topic ?? mapping.topic}, cadence=${params.cadence ?? mapping.cadence}`,
      );
    }

    let syncedStudyReminders = false;
    if (params.syncStudyReminders !== false) {
      try {
        await this.studyReminderSyncService.syncUpcomingSessions({
          userId: params.userId,
        });
        syncedStudyReminders = true;
      } catch (error) {
        this.logger.error(
          `Study reminder sync after relink failed userId=${params.userId}`,
          error,
        );
      }
    }

    if (relinked && params.notifyUser !== false) {
      await this.outbound.sendTextViaPsid({
        psid: params.psid,
        userId: params.userId,
        text: buildMappingUserIdRelinkedMessage(params.userId),
        messageType: 'MAPPING_USER_ID_UPDATED',
      });
    }

    return {
      mapping,
      relinked,
      previousUserId,
      syncedStudyReminders,
    };
  }
}

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CHAT_QUOTA_EVENT_REPOSITORY } from '../../domain/repositories/chat-quota-event.repository.port';
import type { ChatQuotaEventRepositoryPort } from '../../domain/repositories/chat-quota-event.repository.port';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';

@Injectable()
export class ChatQuotaEventCleanupService {
  private readonly logger = new Logger(ChatQuotaEventCleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly chatConfig: ChatRateLimitConfigService,
    @Inject(CHAT_QUOTA_EVENT_REPOSITORY)
    private readonly eventRepository: ChatQuotaEventRepositoryPort,
  ) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('CHAT_QUOTA_EVENTS_CLEANUP_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return this.chatConfig.isQuotaEventsEnabled();
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getRetentionDays(): number {
    return this.chatConfig.getQuotaEventsRetentionDays();
  }

  async purgeExpiredEvents(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = this.getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted = await this.eventRepository.deleteOlderThan(cutoff);

    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} chat_quota_events row(s) older than ${retentionDays} day(s) (before ${cutoff.toISOString()})`,
      );
    } else {
      this.logger.log(
        `chat_quota_events cleanup: 0 rows older than ${retentionDays} day(s)`,
      );
    }

    return { deleted, cutoff: cutoff.toISOString() };
  }
}

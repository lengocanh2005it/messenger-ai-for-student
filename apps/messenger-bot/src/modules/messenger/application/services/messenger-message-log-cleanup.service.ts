import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';

const DEFAULT_RETENTION_DAYS = 90;

@Injectable()
export class MessengerMessageLogCleanupService {
  private readonly logger = new Logger(MessengerMessageLogCleanupService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly messengerRepository: MessengerRepositoryPort,
  ) {}

  isEnabled(): boolean {
    const raw = this.configService
      .get<string>('MESSENGER_MESSAGE_LOG_CLEANUP_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  getRetentionDays(): number {
    const raw = this.configService
      .get<string>('MESSENGER_MESSAGE_LOG_RETENTION_DAYS')
      ?.trim();

    if (!raw) {
      return DEFAULT_RETENTION_DAYS;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      return DEFAULT_RETENTION_DAYS;
    }

    return Math.floor(value);
  }

  async purgeExpiredLogs(): Promise<{ deleted: number; cutoff: string }> {
    const retentionDays = this.getRetentionDays();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleted =
      await this.messengerRepository.deleteMessageLogsOlderThan(cutoff);

    if (deleted > 0) {
      this.logger.log(
        `Purged ${deleted} message_logs row(s) older than ${retentionDays} day(s) (before ${cutoff.toISOString()})`,
      );
    } else {
      this.logger.log(
        `message_logs cleanup: 0 rows older than ${retentionDays} day(s)`,
      );
    }

    return { deleted, cutoff: cutoff.toISOString() };
  }
}

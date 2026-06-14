import { Injectable } from '@nestjs/common';
import { ChatQuotaOpsSummary } from '../../domain/entities/chat-quota-ops.types';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';
import { ChatRateLimitRepository } from '../../infrastructure/persistence/chat-rate-limit.repository';

@Injectable()
export class ChatQuotaOpsService {
  constructor(
    private readonly chatRateLimitRepository: ChatRateLimitRepository,
    private readonly chatRateLimitConfigService: ChatRateLimitConfigService,
  ) {}

  async getSummary(): Promise<ChatQuotaOpsSummary> {
    const settings = this.chatRateLimitConfigService.getSettings();
    const stuckBefore = new Date(Date.now() - settings.stuckReservedMs);
    const usageDate = this.todayUsageDate(settings.timezone);

    const [stuckReserved, idempotencyByStatus, usersAtDailyLimit] =
      await Promise.all([
        this.chatRateLimitRepository.countStuckReserved(stuckBefore),
        this.chatRateLimitRepository.countIdempotencyByStatusForUsageDate(
          usageDate,
        ),
        this.chatRateLimitRepository.countUsersAtOrAboveDailyLimit(
          usageDate,
          settings.freeFormDailyLimit,
        ),
      ]);

    return {
      usageDate,
      stuckReserved,
      stuckReservedMs: settings.stuckReservedMs,
      denyLogs24h: 0,
      usersAtDailyLimit,
      dailyLimit: settings.freeFormDailyLimit,
      idempotencyByStatus,
      logGrepHints: [
        'CHAT_QUOTA_DENY',
        'CHAT_QUOTA_REFUND',
        'CHAT_QUOTA_RECOVERED',
      ],
    };
  }

  private todayUsageDate(timezone: string, now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

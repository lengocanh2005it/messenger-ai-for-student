import { Inject, Injectable } from '@nestjs/common';
import { todayUsageDate } from '@wispace/chat-metering';
import { ChatQuotaOpsSummary } from '../../domain/entities/chat-quota-ops.types';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';
import {
  CHAT_OPS_PORT,
  type ChatOpsPort,
} from '../../domain/repositories/chat-ops.port';

@Injectable()
export class ChatQuotaOpsService {
  constructor(
    @Inject(CHAT_OPS_PORT)
    private readonly opsPort: ChatOpsPort,
    private readonly chatRateLimitConfigService: ChatRateLimitConfigService,
  ) {}

  async getSummary(): Promise<ChatQuotaOpsSummary> {
    const settings = this.chatRateLimitConfigService.getSettings();
    const stuckBefore = new Date(Date.now() - settings.stuckReservedMs);
    const usageDate = todayUsageDate(settings.timezone);

    const [stuckReserved, idempotencyByStatus, usersAtDailyLimit] =
      await Promise.all([
        this.opsPort.countStuckReserved(stuckBefore),
        this.opsPort.countIdempotencyByStatusForUsageDate(usageDate),
        this.opsPort.countUsersAtOrAboveDailyLimit(
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
}

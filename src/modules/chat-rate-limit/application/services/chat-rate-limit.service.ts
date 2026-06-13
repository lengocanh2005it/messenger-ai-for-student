import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ChatQuotaCheckResult,
  ChatRateLimitSettings,
} from '../../domain/entities/chat-quota.types';
import type { RecoverIdempotencyOutcome } from '../../domain/entities/chat-idempotency.types';
import {
  CHAT_RATE_LIMIT_REPOSITORY,
  type ChatRateLimitRepositoryPort,
} from '../../domain/repositories/chat-rate-limit.repository.port';
import { todayUsageDate } from '../utils/chat-usage-date.utils';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';

const BURST_WINDOW_MS = 60_000;

/**
 * Reserve runs before LLM (Phase 3 queue hook). Refund on LLM/Send failure.
 * Burst check runs before daily reserve (Phase 4).
 */
@Injectable()
export class ChatRateLimitService {
  private readonly logger = new Logger(ChatRateLimitService.name);

  constructor(
    private readonly configService: ChatRateLimitConfigService,
    @Inject(CHAT_RATE_LIMIT_REPOSITORY)
    private readonly repository: ChatRateLimitRepositoryPort,
  ) {}

  getSettings(): ChatRateLimitSettings {
    return this.configService.getSettings();
  }

  isEnabled(): boolean {
    return this.configService.isEnabled();
  }

  isWhitelisted(psid: string): boolean {
    return this.configService.isWhitelisted(psid);
  }

  shouldEnforceForPsid(psid: string): boolean {
    return this.configService.shouldEnforceForPsid(psid);
  }

  async checkQuota(
    psid: string,
    _userId?: number,
  ): Promise<ChatQuotaCheckResult> {
    void _userId;

    const { freeFormDailyLimit, timezone } = this.configService.getSettings();
    const usageDate = todayUsageDate(timezone);

    if (!this.configService.shouldEnforceForPsid(psid)) {
      const used = this.configService.isEnabled()
        ? await this.repository.getDailyUsageCount(psid, usageDate)
        : 0;
      return this.buildBypassResult(used, freeFormDailyLimit, usageDate);
    }

    const used = await this.repository.getDailyUsageCount(psid, usageDate);
    return this.buildQuotaResult(used, freeFormDailyLimit, usageDate);
  }

  async reserveFreeFormSlot(
    psid: string,
    params: { userId?: number; idempotencyKey: string },
  ): Promise<ChatQuotaCheckResult> {
    const { freeFormDailyLimit, burstPerMinute, timezone } =
      this.configService.getSettings();
    const usageDate = todayUsageDate(timezone);

    if (!this.configService.shouldEnforceForPsid(psid)) {
      const used = this.configService.isEnabled()
        ? await this.repository.getDailyUsageCount(psid, usageDate)
        : 0;
      return this.buildBypassResult(used, freeFormDailyLimit, usageDate);
    }

    const burstCount = await this.repository.countRecentReservations(
      psid,
      new Date(Date.now() - BURST_WINDOW_MS),
      {
        includeRefunded: this.configService.getBurstCountsRefunded(),
      },
    );
    if (burstCount >= burstPerMinute) {
      this.logQuotaDeny(
        'BURST_LIMIT',
        psid,
        params.idempotencyKey,
        burstCount,
        burstPerMinute,
      );
      return {
        allowed: false,
        used: burstCount,
        limit: burstPerMinute,
        remaining: 0,
        reason: 'BURST_LIMIT',
        usageDate,
        quotaReserved: false,
      };
    }

    const usedBefore = await this.repository.getDailyUsageCount(
      psid,
      usageDate,
    );
    if (usedBefore >= freeFormDailyLimit) {
      this.logQuotaDeny(
        'DAILY_LIMIT',
        psid,
        params.idempotencyKey,
        usedBefore,
        freeFormDailyLimit,
      );
      return {
        allowed: false,
        used: usedBefore,
        limit: freeFormDailyLimit,
        remaining: 0,
        reason: 'DAILY_LIMIT',
        usageDate,
        quotaReserved: false,
      };
    }

    const outcome = await this.reserveSlotOrRecoverOnConflict(psid, {
      userId: params.userId,
      usageDate,
      idempotencyKey: params.idempotencyKey,
      dailyLimit: freeFormDailyLimit,
    });

    if (outcome.status === 'daily_limit_exceeded') {
      const used = await this.repository.getDailyUsageCount(psid, usageDate);
      this.logQuotaDeny(
        'DAILY_LIMIT',
        psid,
        params.idempotencyKey,
        used,
        freeFormDailyLimit,
      );
      return {
        allowed: false,
        used,
        limit: freeFormDailyLimit,
        remaining: 0,
        reason: 'DAILY_LIMIT',
        usageDate,
        quotaReserved: false,
      };
    }

    if (outcome.status === 'idempotency_conflict') {
      const used = await this.repository.getDailyUsageCount(psid, usageDate);
      return {
        allowed: false,
        used,
        limit: freeFormDailyLimit,
        remaining: Math.max(freeFormDailyLimit - used, 0),
        reason: 'IDEMPOTENCY_CONFLICT',
        usageDate,
        quotaReserved: false,
      };
    }

    return {
      allowed: true,
      used: outcome.freeFormCount,
      limit: freeFormDailyLimit,
      remaining: Math.max(freeFormDailyLimit - outcome.freeFormCount, 0),
      usageDate,
      quotaReserved: true,
    };
  }

  async refundFreeFormSlot(
    psid: string,
    usageDate: string,
    idempotencyKey: string,
  ): Promise<void> {
    if (!this.configService.shouldEnforceForPsid(psid)) {
      return;
    }

    const refunded = await this.repository.refundReservedSlot({
      psid,
      usageDate,
      idempotencyKey,
    });

    if (refunded) {
      this.logger.warn(
        `CHAT_QUOTA_REFUND psid=${psid} mid=${idempotencyKey} usageDate=${usageDate}`,
      );
    }
  }

  async markCompleted(idempotencyKey: string): Promise<void> {
    if (!this.configService.isEnabled()) {
      return;
    }

    await this.repository.completeReservedSlot(idempotencyKey);
  }

  /**
   * H2 ops: refund + release keys stuck in `reserved` past TTL.
   */
  async recoverStuckReservedSlots(): Promise<{ recovered: string[] }> {
    if (!this.configService.isEnabled()) {
      return { recovered: [] };
    }

    const stuckBefore = this.stuckReservedCutoff();
    const recovered =
      await this.repository.recoverAllStuckReserved(stuckBefore);

    if (recovered.length > 0) {
      this.logger.warn(
        `CHAT_QUOTA_RECOVERED count=${recovered.length} keys=${recovered.join(',')}`,
      );
    }

    return { recovered };
  }

  private stuckReservedCutoff(): Date {
    return new Date(Date.now() - this.configService.getStuckReservedMs());
  }

  private async reserveSlotOrRecoverOnConflict(
    psid: string,
    input: {
      userId?: number;
      usageDate: string;
      idempotencyKey: string;
      dailyLimit: number;
    },
  ) {
    let outcome = await this.repository.reserveFreeFormSlotInTransaction({
      psid,
      userId: input.userId,
      usageDate: input.usageDate,
      idempotencyKey: input.idempotencyKey,
      dailyLimit: input.dailyLimit,
    });

    if (
      outcome.status !== 'idempotency_conflict' &&
      outcome.status !== 'daily_limit_exceeded'
    ) {
      return outcome;
    }

    if (outcome.status === 'daily_limit_exceeded') {
      return outcome;
    }

    const recovery = await this.repository.recoverIdempotencyForRetry(
      input.idempotencyKey,
      this.stuckReservedCutoff(),
    );

    if (recovery === 'reopened') {
      this.logger.log(
        `Reopened idempotency mid=${input.idempotencyKey} psid=${psid} for retry (H2)`,
      );
      outcome = await this.repository.reserveFreeFormSlotInTransaction({
        psid,
        userId: input.userId,
        usageDate: input.usageDate,
        idempotencyKey: input.idempotencyKey,
        dailyLimit: input.dailyLimit,
      });
    } else {
      this.logIdempotencyConflict(input.idempotencyKey, psid, recovery);
    }

    return outcome;
  }

  private logIdempotencyConflict(
    idempotencyKey: string,
    psid: string,
    recovery: RecoverIdempotencyOutcome,
  ): void {
    if (recovery === 'in_flight') {
      this.logger.log(
        `Idempotency in flight mid=${idempotencyKey} psid=${psid}; skip duplicate flush`,
      );
      return;
    }

    if (recovery === 'completed') {
      this.logger.log(
        `Idempotency already completed mid=${idempotencyKey} psid=${psid}; skip duplicate flush`,
      );
    }
  }

  private logQuotaDeny(
    reason: 'DAILY_LIMIT' | 'BURST_LIMIT',
    psid: string,
    idempotencyKey: string,
    used: number,
    limit: number,
  ): void {
    this.logger.warn(
      `CHAT_QUOTA_DENY reason=${reason} psid=${psid} mid=${idempotencyKey} used=${used} limit=${limit}`,
    );
  }

  private buildQuotaResult(
    used: number,
    limit: number,
    usageDate: string,
  ): ChatQuotaCheckResult {
    const remaining = Math.max(limit - used, 0);

    return {
      allowed: used < limit,
      used,
      limit,
      remaining,
      reason: used >= limit ? 'DAILY_LIMIT' : undefined,
      usageDate,
      quotaReserved: false,
    };
  }

  private buildBypassResult(
    used: number,
    limit: number,
    usageDate: string,
  ): ChatQuotaCheckResult {
    return {
      allowed: true,
      used,
      limit,
      remaining: Math.max(limit - used, 0),
      usageDate,
      quotaReserved: false,
    };
  }
}

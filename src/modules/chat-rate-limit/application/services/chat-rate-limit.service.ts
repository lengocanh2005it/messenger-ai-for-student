import { Inject, Injectable } from '@nestjs/common';
import type {
  ChatQuotaCheckResult,
  ChatRateLimitSettings,
} from '../../domain/entities/chat-quota.types';
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
    );
    if (burstCount >= burstPerMinute) {
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

    const outcome = await this.repository.reserveFreeFormSlotInTransaction({
      psid,
      userId: params.userId,
      usageDate,
      idempotencyKey: params.idempotencyKey,
    });

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

    await this.repository.refundReservedSlot({
      psid,
      usageDate,
      idempotencyKey,
    });
  }

  async markCompleted(idempotencyKey: string): Promise<void> {
    if (!this.configService.isEnabled()) {
      return;
    }

    await this.repository.completeReservedSlot(idempotencyKey);
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

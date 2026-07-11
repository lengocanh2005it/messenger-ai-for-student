import { Inject, Injectable, Logger } from '@nestjs/common';
import { ChatRateLimitCore, todayUsageDate } from '@wispace/chat-metering';
import type {
  ChatQuotaCheckResult,
  ChatRateLimitSettings,
} from '../../domain/entities/chat-quota.types';
import { MetricsService } from '../../../metrics/metrics.service';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';
import { ChatQuotaEventRecorderService } from './chat-quota-event-recorder.service';

export const CHAT_RATE_LIMIT_CORE = Symbol('CHAT_RATE_LIMIT_CORE');

/**
 * Thin adapter over ChatRateLimitCore (packages/chat-metering).
 * Owns Messenger-specific cross-cutting concerns: whitelist bypass, metrics,
 * and quota event recording. All quota algorithm logic lives in the core.
 */
@Injectable()
export class ChatRateLimitService {
  private readonly logger = new Logger(ChatRateLimitService.name);

  constructor(
    private readonly configService: ChatRateLimitConfigService,
    @Inject(CHAT_RATE_LIMIT_CORE)
    private readonly core: ChatRateLimitCore,
    private readonly quotaEventRecorder: ChatQuotaEventRecorderService,
    private readonly metrics: MetricsService,
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

    if (!this.configService.shouldEnforceForPsid(psid)) {
      const settings = this.configService.getSettings();
      const usageDate = todayUsageDate(settings.timezone);
      const used = this.configService.isEnabled()
        ? await this.core.checkQuota(psid).then((r) => r.used)
        : 0;
      return this.buildBypassResult(
        used,
        settings.freeFormDailyLimit,
        usageDate,
      );
    }

    return this.core.checkQuota(psid);
  }

  async reserveFreeFormSlot(
    psid: string,
    params: { userId?: number; idempotencyKey: string },
  ): Promise<ChatQuotaCheckResult> {
    if (!this.configService.shouldEnforceForPsid(psid)) {
      const settings = this.configService.getSettings();
      const usageDate = todayUsageDate(settings.timezone);
      const used = this.configService.isEnabled()
        ? await this.core.checkQuota(psid).then((r) => r.used)
        : 0;
      return this.buildBypassResult(
        used,
        settings.freeFormDailyLimit,
        usageDate,
      );
    }

    const result = await this.core.reserveFreeFormSlot(psid, params);

    if (!result.allowed) {
      this.metrics.quotaDenied.inc({ reason: result.reason! });
      this.quotaEventRecorder.recordDeniedBestEffort({
        psid,
        userId: params.userId,
        usageDate: result.usageDate,
        reason: result.reason as 'DAILY_LIMIT' | 'BURST_LIMIT',
        limit: result.limit,
        used: result.used,
      });
    }

    return result;
  }

  async refundFreeFormSlot(
    psid: string,
    usageDate: string,
    idempotencyKey: string,
    options?: { userId?: number },
  ): Promise<void> {
    if (!this.configService.shouldEnforceForPsid(psid)) {
      return;
    }

    return this.core.refundFreeFormSlot(
      psid,
      usageDate,
      idempotencyKey,
      options,
    );
  }

  async markCompleted(idempotencyKey: string): Promise<void> {
    if (!this.configService.isEnabled()) {
      return;
    }

    return this.core.markCompleted(idempotencyKey);
  }

  async recoverStuckReservedSlots(): Promise<{ recovered: string[] }> {
    if (!this.configService.isEnabled()) {
      return { recovered: [] };
    }

    return this.core.recoverStuckReservedSlots();
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

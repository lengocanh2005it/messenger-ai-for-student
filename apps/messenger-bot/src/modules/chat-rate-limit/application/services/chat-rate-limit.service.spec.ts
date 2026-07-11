/* eslint-disable @typescript-eslint/unbound-method -- Jest mock method assertions */
import { ConfigService } from '@nestjs/config';
import type { ChatRateLimitCore } from '@wispace/chat-metering';
import type { MetricsService } from '../../../metrics/metrics.service';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';
import { ChatQuotaEventRecorderService } from './chat-quota-event-recorder.service';
import { ChatRateLimitService } from './chat-rate-limit.service';

describe('ChatRateLimitService', () => {
  const usageDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  const createService = (
    enabled: boolean,
    options: {
      coreCheckQuota?: ReturnType<typeof jest.fn>;
      coreReserveFreeFormSlot?: ReturnType<typeof jest.fn>;
      coreRefundFreeFormSlot?: ReturnType<typeof jest.fn>;
      coreMarkCompleted?: ReturnType<typeof jest.fn>;
      coreRecoverStuckReservedSlots?: ReturnType<typeof jest.fn>;
      whitelistPsids?: string;
    } = {},
  ) => {
    const config = {
      get: (key: string) => {
        const values: Record<string, string> = {
          CHAT_RATE_LIMIT_ENABLED: enabled ? 'true' : 'false',
          CHAT_FREE_FORM_DAILY_LIMIT: '15',
          CHAT_BURST_PER_MINUTE: '3',
          CHAT_USAGE_TIMEZONE: 'Asia/Ho_Chi_Minh',
          CHAT_RATE_LIMIT_WHITELIST_PSIDS: options.whitelistPsids ?? '',
          CHAT_QUOTA_REMAINING_HINT_THRESHOLD: '3',
          CHAT_IDEMPOTENCY_STUCK_RESERVED_MS: '600000',
          CHAT_MERGED_TEXT_MAX_CHARS: '4000',
          CHAT_BURST_COUNT_REFUNDED: 'false',
          CHAT_QUOTA_EVENTS_ENABLED: 'true',
        };
        return values[key];
      },
    } as ConfigService;

    const configService = new ChatRateLimitConfigService(config);

    const core = {
      checkQuota:
        options.coreCheckQuota ??
        jest.fn().mockResolvedValue({
          allowed: true,
          used: 0,
          limit: 15,
          remaining: 15,
          usageDate: '2026-07-11',
          quotaReserved: false,
        }),
      reserveFreeFormSlot:
        options.coreReserveFreeFormSlot ??
        jest.fn().mockResolvedValue({
          allowed: true,
          used: 1,
          limit: 15,
          remaining: 14,
          usageDate: '2026-07-11',
          quotaReserved: true,
        }),
      refundFreeFormSlot:
        options.coreRefundFreeFormSlot ??
        jest.fn().mockResolvedValue(undefined),
      markCompleted:
        options.coreMarkCompleted ?? jest.fn().mockResolvedValue(undefined),
      recoverStuckReservedSlots:
        options.coreRecoverStuckReservedSlots ??
        jest.fn().mockResolvedValue({ recovered: [] }),
    } as unknown as ChatRateLimitCore;

    const quotaEventRecorder = {
      recordDeniedBestEffort: jest.fn(() => Promise.resolve()),
      isEnabled: jest.fn(() => true),
    } as unknown as ChatQuotaEventRecorderService;

    const metrics = {
      quotaDenied: { inc: jest.fn() },
    } as unknown as MetricsService;

    const service = new ChatRateLimitService(
      configService,
      core,
      quotaEventRecorder,
      metrics,
    );

    return {
      service,
      core,
      quotaEventRecorder,
      metrics,
    };
  };

  it('allows checkQuota when usage is under the daily limit', async () => {
    const { service, core } = createService(true, {
      coreCheckQuota: jest.fn().mockResolvedValue({
        allowed: true,
        used: 7,
        limit: 15,
        remaining: 8,
        usageDate: '2026-07-11',
        quotaReserved: false,
      }),
    });

    const result = await service.checkQuota('psid-1', 143);

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(7);
    expect(result.limit).toBe(15);
    expect(result.remaining).toBe(8);
    expect(result.usageDate).toMatch(usageDatePattern);
    expect(core.checkQuota).toHaveBeenCalledWith('psid-1');
  });

  it('denies checkQuota when usage reaches the daily limit', async () => {
    const { service, core } = createService(true, {
      coreCheckQuota: jest.fn().mockResolvedValue({
        allowed: false,
        used: 15,
        limit: 15,
        remaining: 0,
        reason: 'DAILY_LIMIT',
        usageDate: '2026-07-11',
        quotaReserved: false,
      }),
    });

    const result = await service.checkQuota('psid-1');

    expect(result).toMatchObject({
      allowed: false,
      used: 15,
      limit: 15,
      remaining: 0,
      reason: 'DAILY_LIMIT',
    });
    expect(result.usageDate).toMatch(usageDatePattern);
    expect(core.checkQuota).toHaveBeenCalledWith('psid-1');
  });

  it('bypasses enforcement when rate limit is disabled', async () => {
    const { service } = createService(false);

    const result = await service.checkQuota('psid-1');

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(15);
    expect(result.remaining).toBe(15);
    expect(result.usageDate).toMatch(usageDatePattern);
  });

  it('reserves a slot when under the daily limit', async () => {
    const { service, core } = createService(true, {
      coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
        allowed: true,
        used: 15,
        limit: 15,
        remaining: 0,
        usageDate: '2026-07-11',
        quotaReserved: true,
      }),
    });

    const result = await service.reserveFreeFormSlot('psid-1', {
      userId: 143,
      idempotencyKey: 'mid-1',
    });

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(15);
    expect(result.limit).toBe(15);
    expect(result.remaining).toBe(0);
    expect(result.usageDate).toMatch(usageDatePattern);
    expect(core.reserveFreeFormSlot).toHaveBeenCalledWith('psid-1', {
      userId: 143,
      idempotencyKey: 'mid-1',
    });
  });

  it('denies reserve when daily limit is reached', async () => {
    const { service, metrics, quotaEventRecorder } = createService(true, {
      coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
        allowed: false,
        used: 15,
        limit: 15,
        remaining: 0,
        reason: 'DAILY_LIMIT',
        usageDate: '2026-07-11',
        quotaReserved: false,
      }),
    });

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-1',
    });

    expect(result).toMatchObject({
      allowed: false,
      used: 15,
      limit: 15,
      remaining: 0,
      reason: 'DAILY_LIMIT',
    });
    expect(result.usageDate).toMatch(usageDatePattern);
    expect(metrics.quotaDenied.inc).toHaveBeenCalledWith({
      reason: 'DAILY_LIMIT',
    });
    expect(quotaEventRecorder.recordDeniedBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        psid: 'psid-1',
        reason: 'DAILY_LIMIT',
      }),
    );
  });

  it('denies reserve on burst limit', async () => {
    const { service, metrics, quotaEventRecorder } = createService(true, {
      coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
        allowed: false,
        used: 3,
        limit: 3,
        remaining: 0,
        reason: 'BURST_LIMIT',
        usageDate: '2026-07-11',
        quotaReserved: false,
      }),
    });

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-burst',
    });

    expect(result).toMatchObject({
      allowed: false,
      used: 3,
      limit: 3,
      remaining: 0,
      reason: 'BURST_LIMIT',
      quotaReserved: false,
    });
    expect(metrics.quotaDenied.inc).toHaveBeenCalledWith({
      reason: 'BURST_LIMIT',
    });
    expect(quotaEventRecorder.recordDeniedBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        psid: 'psid-1',
        reason: 'BURST_LIMIT',
      }),
    );
  });

  it('does not increment metrics when reserve succeeds', async () => {
    const { service, metrics } = createService(true);

    await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-ok',
    });

    expect(metrics.quotaDenied.inc).not.toHaveBeenCalled();
  });

  it('bypasses reserve for whitelisted psid', async () => {
    const { service, core } = createService(true, {
      whitelistPsids: 'psid-qa',
    });

    const result = await service.reserveFreeFormSlot('psid-qa', {
      idempotencyKey: 'mid-qa',
    });

    expect(result.allowed).toBe(true);
    expect(result.quotaReserved).toBe(false);
    expect(core.reserveFreeFormSlot).not.toHaveBeenCalled();
  });

  it('keeps checkQuota allowed for whitelisted psid at daily limit', async () => {
    const { service } = createService(true, {
      whitelistPsids: 'psid-qa',
    });

    const result = await service.checkQuota('psid-qa');

    expect(result.allowed).toBe(true);
  });

  it('rejects duplicate reserve for the same message mid', async () => {
    const { service } = createService(true, {
      coreReserveFreeFormSlot: jest
        .fn()
        .mockResolvedValueOnce({
          allowed: true,
          used: 1,
          limit: 15,
          remaining: 14,
          usageDate: '2026-07-11',
          quotaReserved: true,
        })
        .mockResolvedValueOnce({
          allowed: false,
          used: 0,
          limit: 15,
          remaining: 15,
          reason: 'IDEMPOTENCY_CONFLICT',
          usageDate: '2026-07-11',
          quotaReserved: false,
        }),
    });

    const first = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-dup',
    });
    const second = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-dup',
    });

    expect(first.allowed).toBe(true);
    expect(second).toMatchObject({
      allowed: false,
      limit: 15,
      reason: 'IDEMPOTENCY_CONFLICT',
    });
    expect(second.usageDate).toMatch(usageDatePattern);
  });

  it('refunds a reserved slot', async () => {
    const { service, core } = createService(true);

    await service.refundFreeFormSlot('psid-1', '2026-07-11', 'mid-refund');

    expect(core.refundFreeFormSlot).toHaveBeenCalledWith(
      'psid-1',
      '2026-07-11',
      'mid-refund',
      undefined,
    );
  });

  it('does not refund for whitelisted psid', async () => {
    const { service, core } = createService(true, {
      whitelistPsids: 'psid-qa',
    });

    await service.refundFreeFormSlot('psid-qa', '2026-07-11', 'mid-qa');

    expect(core.refundFreeFormSlot).not.toHaveBeenCalled();
  });

  it('delegates recoverStuckReservedSlots to core', async () => {
    const { service, core } = createService(true, {
      coreRecoverStuckReservedSlots: jest.fn().mockResolvedValue({
        recovered: ['mid-a', 'mid-b'],
      }),
    });

    await expect(service.recoverStuckReservedSlots()).resolves.toEqual({
      recovered: ['mid-a', 'mid-b'],
    });
    expect(core.recoverStuckReservedSlots).toHaveBeenCalled();
  });

  it('returns empty recovered when disabled', async () => {
    const { service, core } = createService(false);

    await expect(service.recoverStuckReservedSlots()).resolves.toEqual({
      recovered: [],
    });
    expect(core.recoverStuckReservedSlots).not.toHaveBeenCalled();
  });

  it('delegates markCompleted to core when enabled', async () => {
    const { service, core } = createService(true);

    await service.markCompleted('mid-1');

    expect(core.markCompleted).toHaveBeenCalledWith('mid-1');
  });

  it('skips markCompleted when disabled', async () => {
    const { service, core } = createService(false);

    await service.markCompleted('mid-1');

    expect(core.markCompleted).not.toHaveBeenCalled();
  });

  it('denies reserve from transaction hard cap (H3)', async () => {
    const { service, metrics } = createService(true, {
      coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
        allowed: false,
        used: 15,
        limit: 15,
        reason: 'DAILY_LIMIT',
        usageDate: '2026-07-11',
        quotaReserved: false,
      }),
    });

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-cap',
    });

    expect(result).toMatchObject({
      allowed: false,
      used: 15,
      limit: 15,
      reason: 'DAILY_LIMIT',
      quotaReserved: false,
    });
    expect(metrics.quotaDenied.inc).toHaveBeenCalledWith({
      reason: 'DAILY_LIMIT',
    });
  });

  describe('metrics — quotaDenied counter', () => {
    it('increments quotaDenied{reason=DAILY_LIMIT} when daily cap is reached', async () => {
      const { service, metrics } = createService(true, {
        coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
          allowed: false,
          used: 15,
          limit: 15,
          remaining: 0,
          reason: 'DAILY_LIMIT',
          usageDate: '2026-07-11',
          quotaReserved: false,
        }),
      });

      await service.reserveFreeFormSlot('psid-1', { idempotencyKey: 'mid-1' });

      expect((metrics.quotaDenied.inc as jest.Mock).mock.calls).toContainEqual([
        { reason: 'DAILY_LIMIT' },
      ]);
    });

    it('increments quotaDenied{reason=BURST_LIMIT} when burst window is full', async () => {
      const { service, metrics } = createService(true, {
        coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
          allowed: false,
          used: 3,
          limit: 3,
          remaining: 0,
          reason: 'BURST_LIMIT',
          usageDate: '2026-07-11',
          quotaReserved: false,
        }),
      });

      await service.reserveFreeFormSlot('psid-1', { idempotencyKey: 'mid-2' });

      expect((metrics.quotaDenied.inc as jest.Mock).mock.calls).toContainEqual([
        { reason: 'BURST_LIMIT' },
      ]);
    });

    it('does not increment quotaDenied when reserve succeeds', async () => {
      const { service, metrics } = createService(true);

      await service.reserveFreeFormSlot('psid-1', { idempotencyKey: 'mid-3' });

      expect(metrics.quotaDenied.inc as jest.Mock).not.toHaveBeenCalled();
    });

    it('increments quotaDenied{reason=DAILY_LIMIT} on H3 transaction hard cap', async () => {
      const { service, metrics } = createService(true, {
        coreReserveFreeFormSlot: jest.fn().mockResolvedValue({
          allowed: false,
          used: 15,
          limit: 15,
          reason: 'DAILY_LIMIT',
          usageDate: '2026-07-11',
          quotaReserved: false,
        }),
      });

      await service.reserveFreeFormSlot('psid-1', { idempotencyKey: 'mid-4' });

      expect((metrics.quotaDenied.inc as jest.Mock).mock.calls).toContainEqual([
        { reason: 'DAILY_LIMIT' },
      ]);
    });
  });
});

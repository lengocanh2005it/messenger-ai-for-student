import { ConfigService } from '@nestjs/config';
import type { ChatRateLimitRepositoryPort } from '../../domain/repositories/chat-rate-limit.repository.port';
import { ChatRateLimitConfigService } from './chat-rate-limit-config.service';
import { ChatRateLimitService } from './chat-rate-limit.service';

describe('ChatRateLimitService', () => {
  const usageDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  const createService = (
    enabled: boolean,
    dailyCount = 0,
    options: {
      burstCount?: number;
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
        };
        return values[key];
      },
    } as ConfigService;

    const configService = new ChatRateLimitConfigService(config);
    let count = dailyCount;
    const idempotencyKeys = new Set<string>();

    let reserveCallCount = 0;
    const repository: ChatRateLimitRepositoryPort = {
      getDailyUsageCount: jest.fn(() => Promise.resolve(count)),
      incrementDailyUsage: jest.fn(() => {
        count += 1;
        return Promise.resolve(count);
      }),
      decrementDailyUsage: jest.fn(() => {
        count = Math.max(count - 1, 0);
        return Promise.resolve(count);
      }),
      tryReserveIdempotency: jest.fn(),
      reserveFreeFormSlotInTransaction: jest.fn(
        ({ idempotencyKey, dailyLimit = 15 }) => {
          reserveCallCount += 1;
          if (idempotencyKeys.has(idempotencyKey)) {
            return Promise.resolve({ status: 'idempotency_conflict' });
          }

          if (count >= dailyLimit) {
            return Promise.resolve({ status: 'daily_limit_exceeded' });
          }

          idempotencyKeys.add(idempotencyKey);
          count += 1;
          return Promise.resolve({
            status: 'reserved',
            freeFormCount: count,
          });
        },
      ),
      refundReservedSlot: jest.fn(({ idempotencyKey }) => {
        if (!idempotencyKeys.has(idempotencyKey)) {
          return Promise.resolve(false);
        }

        idempotencyKeys.delete(idempotencyKey);
        count = Math.max(count - 1, 0);
        return Promise.resolve(true);
      }),
      completeReservedSlot: jest.fn((idempotencyKey: string) =>
        Promise.resolve(idempotencyKeys.has(idempotencyKey)),
      ),
      countRecentReservations: jest.fn(() =>
        Promise.resolve(options.burstCount ?? 0),
      ),
      updateIdempotencyStatus: jest.fn(() => Promise.resolve(true)),
      getIdempotencyByKey: jest.fn(() => Promise.resolve(null)),
      listStuckReserved: jest.fn(() => Promise.resolve([])),
      recoverIdempotencyForRetry: jest.fn(() => Promise.resolve('not_found')),
      recoverAllStuckReserved: jest.fn(() => Promise.resolve([])),
    };

    const service = new ChatRateLimitService(configService, repository);

    return {
      service,
      repository,
      getCount: () => count,
      getReserveCallCount: () => reserveCallCount,
    };
  };

  it('allows checkQuota when usage is under the daily limit', async () => {
    const { service } = createService(true, 7);

    const result = await service.checkQuota('psid-1', 143);

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(7);
    expect(result.limit).toBe(15);
    expect(result.remaining).toBe(8);
    expect(result.usageDate).toMatch(usageDatePattern);
  });

  it('denies checkQuota when usage reaches the daily limit', async () => {
    const { service } = createService(true, 15);

    const result = await service.checkQuota('psid-1');

    expect(result).toMatchObject({
      allowed: false,
      used: 15,
      limit: 15,
      remaining: 0,
      reason: 'DAILY_LIMIT',
    });
    expect(result.usageDate).toMatch(usageDatePattern);
  });

  it('bypasses enforcement when rate limit is disabled', async () => {
    const { service } = createService(false, 99);

    const result = await service.checkQuota('psid-1');

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(0);
    expect(result.limit).toBe(15);
    expect(result.remaining).toBe(15);
    expect(result.usageDate).toMatch(usageDatePattern);
  });

  it('reserves a slot when under the daily limit', async () => {
    const { service, getCount } = createService(true, 14);

    const result = await service.reserveFreeFormSlot('psid-1', {
      userId: 143,
      idempotencyKey: 'mid-1',
    });

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(15);
    expect(result.limit).toBe(15);
    expect(result.remaining).toBe(0);
    expect(result.usageDate).toMatch(usageDatePattern);
    expect(getCount()).toBe(15);
  });

  it('denies reserve without incrementing when daily limit is reached', async () => {
    const { service, getCount, getReserveCallCount } = createService(true, 15);

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
    expect(getReserveCallCount()).toBe(0);
    expect(getCount()).toBe(15);
  });

  it('denies reserve on burst limit before daily transaction', async () => {
    const { service, getCount, getReserveCallCount, repository } =
      createService(true, 0, {
        burstCount: 3,
      });

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-burst',
    });

    expect(repository.countRecentReservations).toHaveBeenCalledWith(
      'psid-1',
      expect.any(Date),
      { includeRefunded: false },
    );

    expect(result).toMatchObject({
      allowed: false,
      used: 3,
      limit: 3,
      remaining: 0,
      reason: 'BURST_LIMIT',
      quotaReserved: false,
    });
    expect(getReserveCallCount()).toBe(0);
    expect(getCount()).toBe(0);
  });

  it('bypasses reserve for whitelisted psid', async () => {
    const { service, getCount, getReserveCallCount } = createService(true, 15, {
      whitelistPsids: 'psid-qa',
    });

    const result = await service.reserveFreeFormSlot('psid-qa', {
      idempotencyKey: 'mid-qa',
    });

    expect(result.allowed).toBe(true);
    expect(result.quotaReserved).toBe(false);
    expect(getReserveCallCount()).toBe(0);
    expect(getCount()).toBe(15);
  });

  it('keeps checkQuota allowed for whitelisted psid at daily limit', async () => {
    const { service } = createService(true, 15, {
      whitelistPsids: 'psid-qa',
    });

    const result = await service.checkQuota('psid-qa');

    expect(result.allowed).toBe(true);
    expect(result.used).toBe(15);
  });

  it('rejects duplicate reserve for the same message mid', async () => {
    const { service, getCount } = createService(true, 0);

    const first = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-dup',
    });
    const second = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-dup',
    });

    expect(first.allowed).toBe(true);
    expect(first.used).toBe(1);
    expect(second).toMatchObject({
      allowed: false,
      used: 1,
      limit: 15,
      remaining: 14,
      reason: 'IDEMPOTENCY_CONFLICT',
    });
    expect(second.usageDate).toMatch(usageDatePattern);
    expect(getCount()).toBe(1);
  });

  it('refunds a reserved slot back to the previous count', async () => {
    const { service, getCount } = createService(true, 0);

    const reserved = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-refund',
    });
    expect(reserved.used).toBe(1);

    await service.refundFreeFormSlot(
      'psid-1',
      reserved.usageDate,
      'mid-refund',
    );

    expect(getCount()).toBe(0);
    await expect(service.checkQuota('psid-1')).resolves.toMatchObject({
      allowed: true,
      used: 0,
      remaining: 15,
    });
  });

  it('re-reserves after recovering stale reserved idempotency on conflict', async () => {
    const { service, repository } = createService(true, 0);
    const reserveMock =
      repository.reserveFreeFormSlotInTransaction as jest.Mock;
    reserveMock
      .mockResolvedValueOnce({ status: 'idempotency_conflict' })
      .mockResolvedValueOnce({ status: 'reserved', freeFormCount: 1 });
    (repository.recoverIdempotencyForRetry as jest.Mock).mockResolvedValue(
      'reopened',
    );

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-stuck',
    });

    expect(repository.recoverIdempotencyForRetry).toHaveBeenCalledWith(
      'mid-stuck',
      expect.any(Date),
    );
    expect(reserveMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      allowed: true,
      used: 1,
      quotaReserved: true,
    });
  });

  it('still denies duplicate reserve when idempotency is in flight', async () => {
    const { service, repository } = createService(true, 1);
    (
      repository.reserveFreeFormSlotInTransaction as jest.Mock
    ).mockResolvedValue({ status: 'idempotency_conflict' });
    (repository.recoverIdempotencyForRetry as jest.Mock).mockResolvedValue(
      'in_flight',
    );

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-flight',
    });

    expect(result).toMatchObject({
      allowed: false,
      reason: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('recovers stuck reserved keys via ops helper', async () => {
    const { service, repository } = createService(true, 2);
    (repository.recoverAllStuckReserved as jest.Mock).mockResolvedValue([
      'mid-a',
      'mid-b',
    ]);

    await expect(service.recoverStuckReservedSlots()).resolves.toEqual({
      recovered: ['mid-a', 'mid-b'],
    });
  });

  it('denies reserve from transaction hard cap even if pre-check passed (H3)', async () => {
    const { service, repository } = createService(true, 14);
    (
      repository.reserveFreeFormSlotInTransaction as jest.Mock
    ).mockResolvedValue({ status: 'daily_limit_exceeded' });

    const result = await service.reserveFreeFormSlot('psid-1', {
      idempotencyKey: 'mid-cap',
    });

    expect(result).toMatchObject({
      allowed: false,
      used: 14,
      limit: 15,
      reason: 'DAILY_LIMIT',
      quotaReserved: false,
    });
  });
});

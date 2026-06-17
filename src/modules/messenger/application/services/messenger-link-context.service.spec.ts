import { ConfigService } from '@nestjs/config';
import { MessengerLinkContextService } from './messenger-link-context.service';
import { WispaceMessengerTokenVerifyService } from '../../infrastructure/wispace/wispace-messenger-token-verify.service';

describe('MessengerLinkContextService', () => {
  const createService = (
    env: Record<string, string | undefined>,
    verifyImpl: WispaceMessengerTokenVerifyService['verifyMessengerToken'],
  ) => {
    const configService = {
      get: (key: string) => env[key],
    } as ConfigService;

    const verifyService = {
      verifyMessengerToken: verifyImpl,
    } as WispaceMessengerTokenVerifyService;

    return new MessengerLinkContextService(configService, verifyService);
  };

  it('uses legacy parse when MESSENGER_LINK_MODE=legacy', async () => {
    const service = createService({ MESSENGER_LINK_MODE: 'legacy' }, jest.fn());

    const outcome = await service.resolveFromRef('psid-1', { ref: '143' });

    expect(outcome).toEqual({
      context: {
        ref: '143',
        userId: 143,
        topic: 'IELTS',
        cadence: 'WEEKLY',
      },
    });
  });

  it('verifies opaque token in token mode', async () => {
    const verify = jest.fn(() =>
      Promise.resolve({
        valid: true as const,
        userId: 143,
        topic: 'IELTS',
        cadence: 'WEEKLY' as const,
      }),
    );

    const service = createService(
      {
        MESSENGER_LINK_MODE: 'token',
        WISPACE_API_VERIFY_MESSENGER_TOKEN:
          'https://backend.aihubproduction.com/api/User/verify-messenger-token',
      },
      verify,
    );

    const outcome = await service.resolveFromRef('psid-1', {
      ref: 'opaque-token',
    });

    expect(verify).toHaveBeenCalledWith('psid-1', 'opaque-token');
    expect(outcome.context).toEqual({
      ref: 'opaque-token',
      userId: 143,
      topic: 'IELTS',
      cadence: 'WEEKLY',
    });
  });

  it('returns verify failure reason without context', async () => {
    const verify = jest.fn(() =>
      Promise.resolve({
        valid: false as const,
        reason: 'EXPIRED' as const,
      }),
    );

    const service = createService({ MESSENGER_LINK_MODE: 'token' }, verify);

    const outcome = await service.resolveFromRef('psid-1', {
      ref: 'opaque-token',
    });

    expect(outcome).toEqual({ verifyFailureReason: 'EXPIRED' });
  });
});

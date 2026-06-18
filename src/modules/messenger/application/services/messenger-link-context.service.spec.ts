import { MessengerLinkContextService } from './messenger-link-context.service';
import { WispaceMessengerTokenVerifyService } from '../../infrastructure/wispace/wispace-messenger-token-verify.service';

describe('MessengerLinkContextService', () => {
  const createService = (
    verifyImpl: WispaceMessengerTokenVerifyService['verifyMessengerToken'],
  ) => {
    const verifyService = {
      verifyMessengerToken: verifyImpl,
    } as WispaceMessengerTokenVerifyService;

    return new MessengerLinkContextService(verifyService);
  };

  it('verifies opaque token via WISPACE', async () => {
    const verify = jest.fn(() =>
      Promise.resolve({
        valid: true as const,
        userId: 143,
        topic: 'IELTS',
        cadence: 'WEEKLY' as const,
      }),
    );

    const service = createService(verify);

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

  it('does not parse numeric ref as userId without verify', async () => {
    const verify = jest.fn(() =>
      Promise.resolve({
        valid: false as const,
        reason: 'NOT_FOUND' as const,
      }),
    );

    const service = createService(verify);

    const outcome = await service.resolveFromRef('psid-1', { ref: '143' });

    expect(verify).toHaveBeenCalledWith('psid-1', '143');
    expect(outcome).toEqual({ verifyFailureReason: 'NOT_FOUND' });
  });

  it('returns verify failure reason without context', async () => {
    const verify = jest.fn(() =>
      Promise.resolve({
        valid: false as const,
        reason: 'EXPIRED' as const,
      }),
    );

    const service = createService(verify);

    const outcome = await service.resolveFromRef('psid-1', {
      ref: 'opaque-token',
    });

    expect(outcome).toEqual({ verifyFailureReason: 'EXPIRED' });
  });
});

import { ConfigService } from '@nestjs/config';
import { WispaceMessengerTokenVerifyService } from './wispace-messenger-token-verify.service';

describe('WispaceMessengerTokenVerifyService', () => {
  const verifyUrl =
    'https://backend.aihubproduction.com/api/User/verify-messenger-token';

  const createService = (env: Record<string, string | undefined> = {}) => {
    const configService = {
      get: (key: string) =>
        ({
          WISPACE_API_VERIFY_MESSENGER_TOKEN_URL: verifyUrl,
          WISPACE_INTERNAL_KEY: 'internal-secret',
          ...env,
        })[key],
    } as ConfigService;

    return new WispaceMessengerTokenVerifyService(configService);
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs token and psid with X-Internal-Key', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            userId: 143,
            username: 'Tab Valenskyeee',
            email: 'billbonny29@gmail.com',
          }),
        ),
    } as Response);

    const service = createService();
    const result = await service.verifyMessengerToken('psid-1', 'token-abc');

    expect(result).toEqual({
      valid: true,
      userId: 143,
      topic: 'IELTS',
      cadence: 'WEEKLY',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      verifyUrl,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Key': 'internal-secret',
        },
        body: JSON.stringify({ token: 'token-abc', psid: 'psid-1' }),
      }),
    );
  });

  it('maps verify failure reason from non-2xx response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      text: () =>
        Promise.resolve(JSON.stringify({ success: false, reason: 'USED' })),
    } as Response);

    const service = createService();
    const result = await service.verifyMessengerToken('psid-1', 'token-abc');

    expect(result).toEqual({ valid: false, reason: 'USED' });
  });

  it('maps success false on HTTP 200 to failure', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () =>
        Promise.resolve(JSON.stringify({ success: false, reason: 'EXPIRED' })),
    } as Response);

    const service = createService();
    const result = await service.verifyMessengerToken('psid-1', 'token-abc');

    expect(result).toEqual({ valid: false, reason: 'EXPIRED' });
  });
});

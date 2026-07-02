/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest.fn() mock of global.fetch */
import { UserGoalsApiClient } from './user-goals-api.client';
import { WispaceApiError } from '../errors/wispace-api.error';

describe('UserGoalsApiClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('fetches goals with the given id header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ targetScore: 7, examDate: '2026-08-01' }),
    });
    global.fetch = fetchMock;

    const client = new UserGoalsApiClient({
      url: 'https://backend.example.com/api/User/goals',
      internalKey: 'internal-key',
    });

    const result = await client.getUserGoals('x-discordid', 'discord-1');

    expect(result).toEqual({ targetScore: 7, examDate: '2026-08-01' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example.com/api/User/goals',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-discordid': 'discord-1' }),
      }),
    );
  });

  it('retries on 5xx then succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve('down'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ targetScore: 7, examDate: '2026-08-01' }),
      });
    global.fetch = fetchMock;

    const client = new UserGoalsApiClient({
      url: 'https://backend.example.com/api/User/goals',
      internalKey: 'internal-key',
      baseDelayMs: 1,
    });

    const result = await client.getUserGoals('x-psid', 'psid-1');

    expect(result.targetScore).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws WispaceApiError without retry on 4xx', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('missing'),
    });
    global.fetch = fetchMock;

    const client = new UserGoalsApiClient({
      url: 'https://backend.example.com/api/User/goals',
      internalKey: 'internal-key',
      baseDelayMs: 1,
    });

    await expect(
      client.getUserGoals('x-psid', 'psid-1'),
    ).rejects.toBeInstanceOf(WispaceApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

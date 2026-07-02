import { buildWispaceHeaders } from './wispace-headers';

describe('buildWispaceHeaders', () => {
  it('builds headers for the given platform id header', () => {
    expect(buildWispaceHeaders('x-discordid', 'discord-1', 'secret')).toEqual({
      'x-discordid': 'discord-1',
      'X-Internal-Key': 'secret',
      Accept: 'application/json',
    });
  });

  it('throws when externalId is blank', () => {
    expect(() => buildWispaceHeaders('x-psid', '  ', 'secret')).toThrow(
      'x-psid is required',
    );
  });

  it('throws when internalKey is blank', () => {
    expect(() => buildWispaceHeaders('x-zaloid', 'zalo-1', '')).toThrow(
      'WISPACE internal key is required',
    );
  });
});

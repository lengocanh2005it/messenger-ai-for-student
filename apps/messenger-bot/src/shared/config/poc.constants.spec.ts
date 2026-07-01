import {
  buildWelcomeMessage,
  FALLBACK_DISPLAY_NAME,
  POC_DEFAULT_LINK_CADENCE,
  POC_DEFAULT_LINK_TOPIC,
  parseMessengerLinkContext,
} from './poc.constants';

describe('parseMessengerLinkContext', () => {
  it('accepts ref-only with POC defaults (Messenger Get Started)', () => {
    expect(parseMessengerLinkContext({ ref: '143' })).toEqual({
      ref: '143',
      userId: 143,
      topic: POC_DEFAULT_LINK_TOPIC,
      cadence: POC_DEFAULT_LINK_CADENCE,
    });
  });

  it('keeps explicit topic and cadence from m.me link', () => {
    expect(
      parseMessengerLinkContext({
        ref: '143',
        topic: 'ai_capacity_report',
        cadence: 'DAILY',
      }),
    ).toEqual({
      ref: '143',
      userId: 143,
      topic: 'ai_capacity_report',
      cadence: 'DAILY',
    });
  });

  it('rejects invalid ref', () => {
    expect(parseMessengerLinkContext({ ref: 'abc' })).toBeUndefined();
  });
});

describe('buildWelcomeMessage', () => {
  it('uses fallback greeting when display name is missing', () => {
    expect(buildWelcomeMessage()).toMatch(/^Chào bạn nha!/);
    expect(buildWelcomeMessage(FALLBACK_DISPLAY_NAME)).toMatch(
      /^Chào bạn nha!/,
    );
  });

  it('personalizes greeting when display name is set', () => {
    expect(buildWelcomeMessage('Minh')).toMatch(/^Chào Minh!/);
  });
});

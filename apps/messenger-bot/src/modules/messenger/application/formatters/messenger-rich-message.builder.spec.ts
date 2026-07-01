import {
  buildCalendarEntriesRichFollowUp,
  buildStudySessionsRichFollowUps,
  clipMessengerLabel,
} from './messenger-rich-message.builder';

describe('messenger-rich-message.builder', () => {
  it('clips long labels', () => {
    expect(clipMessengerLabel('a'.repeat(90), 80)).toHaveLength(80);
    expect(clipMessengerLabel('a'.repeat(90), 80).endsWith('…')).toBe(true);
  });

  it('builds generic session cards only', () => {
    const followUps = buildStudySessionsRichFollowUps([
      {
        scheduledTimeLabel: 'Hôm nay lúc 08:00',
        topic: 'IELTS Writing',
      },
    ]);

    expect(followUps).toHaveLength(1);
    expect(followUps[0].kind).toBe('generic');
    if (followUps[0].kind === 'generic') {
      expect(followUps[0].elements[0].title).toContain('📅');
    }
  });

  it('builds calendar cards without internal ids', () => {
    const followUp = buildCalendarEntriesRichFollowUp([
      {
        scheduledTimeLabel: '15/06/2026 lúc 08:00',
        topic: 'IELTS Writing',
      },
    ]);

    expect(followUp?.kind).toBe('generic');
    if (followUp?.kind === 'generic') {
      expect(followUp.elements[0].title).toBe('📅 15/06/2026 lúc 08:00');
      expect(followUp.elements[0].subtitle).toBe('IELTS Writing');
      expect(followUp.elements[0].subtitle).not.toContain('ID');
    }
  });
});

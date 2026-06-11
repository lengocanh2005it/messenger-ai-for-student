import {
  hasExplicitRescheduleTarget,
  isRescheduleIntent,
} from './messenger-chat-intent.utils';

describe('messenger-chat-intent.utils', () => {
  it('detects vague reschedule intent', () => {
    expect(isRescheduleIntent('mình muốn đổi lịch học')).toBe(true);
  });

  it('ignores schedule view intent', () => {
    expect(isRescheduleIntent('mình muốn xem lịch học')).toBe(false);
  });

  it('detects explicit session target', () => {
    expect(hasExplicitRescheduleTarget('đổi buổi ngày mai')).toBe(true);
    expect(hasExplicitRescheduleTarget('đổi sang 25/06')).toBe(true);
  });

  it('treats vague reschedule as non-explicit target', () => {
    expect(hasExplicitRescheduleTarget('mình muốn đổi lịch học')).toBe(false);
  });
});

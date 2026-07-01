import { isObviouslyOffTopic } from './messenger-scope.utils';

describe('messenger-scope.utils', () => {
  it('allows greetings and WISPACE-related questions', () => {
    expect(isObviouslyOffTopic('hello')).toBe(false);
    expect(isObviouslyOffTopic('mình muốn xem tiến độ học')).toBe(false);
    expect(isObviouslyOffTopic('lịch học sắp tới')).toBe(false);
  });

  it('flags clearly off-topic questions', () => {
    expect(isObviouslyOffTopic('thời tiết hôm nay thế nào')).toBe(true);
    expect(isObviouslyOffTopic('công thức nấu phở')).toBe(true);
    expect(isObviouslyOffTopic('bóng đá tối qua')).toBe(true);
  });
});

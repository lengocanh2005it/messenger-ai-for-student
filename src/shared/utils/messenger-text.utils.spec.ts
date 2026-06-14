import {
  capMergedChatUserText,
  mergeChatUserTexts,
  sanitizeMessengerText,
  splitMessengerBubbles,
} from './messenger-text.utils';

describe('sanitizeMessengerText', () => {
  it('removes asterisk emphasis used for bold or italic', () => {
    const input = [
      'Task 2 intro nên ngắn gọn, thường chỉ cần *2 câu*:',
      '',
      '1. *Paraphrase đề bài*',
      '2. *Nêu thesis/opinion*',
    ].join('\n');

    expect(sanitizeMessengerText(input)).toBe(
      [
        'Task 2 intro nên ngắn gọn, thường chỉ cần 2 câu:',
        '',
        '1. Paraphrase đề bài',
        '2. Nêu thesis/opinion',
      ].join('\n'),
    );
  });
});

describe('splitMessengerBubbles', () => {
  it('keeps short text as one bubble', () => {
    expect(splitMessengerBubbles('Xin chào')).toEqual(['Xin chào']);
  });

  it('splits on paragraph breaks', () => {
    expect(splitMessengerBubbles('Đoạn 1\n\nĐoạn 2\n\nĐoạn 3', 4, 200)).toEqual(
      ['Đoạn 1', 'Đoạn 2', 'Đoạn 3'],
    );
  });
});

describe('mergeChatUserTexts', () => {
  it('merges burst messages with numbered lines', () => {
    expect(mergeChatUserTexts(['lịch học', 'tiến độ'])).toBe(
      '1. lịch học\n2. tiến độ',
    );
  });
});

describe('capMergedChatUserText', () => {
  it('returns text unchanged when under the limit', () => {
    expect(capMergedChatUserText('ngắn', 100)).toBe('ngắn');
  });

  it('truncates long merged text with a Vietnamese suffix (H5)', () => {
    const capped = capMergedChatUserText('a'.repeat(200), 100);

    expect(capped.length).toBeLessThanOrEqual(100);
    expect(capped).toContain('…');
    expect(capped).toContain('phần đầu tin nhắn');
  });
});

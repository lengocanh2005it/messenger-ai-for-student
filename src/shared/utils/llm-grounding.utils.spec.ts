import { checkLlmGrounding } from './llm-grounding.utils';

describe('checkLlmGrounding', () => {
  describe('clean responses — should NOT be flagged', () => {
    const cases = [
      [
        'general IELTS advice',
        'Để đạt band 7, bạn cần luyện coherence và Task Achievement.',
        new Set<string>(),
      ],
      ['greeting', 'Xin chào! Mình có thể giúp gì cho bạn?', new Set<string>()],
      [
        'off-topic redirect',
        'Mình chỉ hỗ trợ về WISPACE và IELTS Writing thôi bạn nhé.',
        new Set<string>(),
      ],
      [
        'score after tool',
        'Band của bạn hiện tại là 6.5 theo mục tiêu bạn đã đặt.',
        new Set(['get_user_goals']),
      ],
      [
        'schedule after tool',
        'Buổi học của bạn lúc 19:00 ngày 28/06.',
        new Set(['list_study_calendar_entries']),
      ],
      [
        'reminder tool covered',
        'Lúc 08:30 ngày 29/6 bạn có buổi học nhé.',
        new Set(['get_upcoming_study_sessions']),
      ],
    ] as const;

    it.each(cases)('%s', (_label, text, tools) => {
      const result = checkLlmGrounding(text, tools);
      expect(result.suspicious).toBe(false);
    });
  });

  describe('suspicious responses — personal score without score tool', () => {
    it('flags "band của bạn là X" with no tool called', () => {
      const result = checkLlmGrounding(
        'Band của bạn hiện tại là 6.5.',
        new Set(),
      );
      expect(result.suspicious).toBe(true);
      expect(result.reason).toBe('score_without_tool');
    });

    it('flags "bạn đang ở band X" with no tool', () => {
      const result = checkLlmGrounding(
        'Theo thông tin cũ, bạn đang ở band 5.5 Writing.',
        new Set(),
      );
      expect(result.suspicious).toBe(true);
      expect(result.reason).toBe('score_without_tool');
    });

    it('flags decimal score "X.X điểm" with no tool', () => {
      const result = checkLlmGrounding(
        'Điểm Writing của bạn là 6.0 điểm.',
        new Set(),
      );
      expect(result.suspicious).toBe(true);
      expect(result.reason).toBe('score_without_tool');
    });

    it('does NOT flag when get_learning_progress_report was called', () => {
      const result = checkLlmGrounding(
        'Band của bạn là 6.0 theo báo cáo.',
        new Set(['get_learning_progress_report']),
      );
      expect(result.suspicious).toBe(false);
    });
  });

  describe('suspicious responses — schedule without schedule tool', () => {
    it('flags specific time "lúc HH:MM" with no tool', () => {
      const result = checkLlmGrounding(
        'Buổi học tiếp theo của bạn lúc 19:00.',
        new Set(),
      );
      expect(result.suspicious).toBe(true);
      expect(result.reason).toBe('schedule_without_tool');
    });

    it('flags specific date "DD/MM" with no tool', () => {
      const result = checkLlmGrounding(
        'Lịch học của bạn vào ngày 28/06.',
        new Set(),
      );
      expect(result.suspicious).toBe(true);
      expect(result.reason).toBe('schedule_without_tool');
    });

    it('does NOT flag when preview_next_study_reminder was called', () => {
      const result = checkLlmGrounding(
        'Buổi học lúc 19:00 ngày 28/06 sắp tới.',
        new Set(['preview_next_study_reminder']),
      );
      expect(result.suspicious).toBe(false);
    });
  });

  describe('result shape', () => {
    it('returns suspicious=false with no reason when clean', () => {
      const result = checkLlmGrounding('Bạn cần luyện thêm nhé!', new Set());
      expect(result).toEqual({ suspicious: false });
    });

    it('returns reason when suspicious', () => {
      const result = checkLlmGrounding('Band của bạn là 7.0.', new Set());
      expect(result.suspicious).toBe(true);
      expect(result.reason).toBeDefined();
    });
  });
});

import type { MessengerRichFollowUp } from '../../domain/entities/messenger-rich-message.types';

const TITLE_MAX = 80;
const SUBTITLE_MAX = 80;
const MAX_GENERIC_ELEMENTS = 10;

export function clipMessengerLabel(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

export function buildStudySessionsRichFollowUps(
  sessions: Array<{
    scheduledTimeLabel: string;
    topic: string;
  }>,
): MessengerRichFollowUp[] {
  if (!sessions.length) {
    return [];
  }

  const elements = sessions.slice(0, MAX_GENERIC_ELEMENTS).map((session) => ({
    title: clipMessengerLabel(`📅 ${session.scheduledTimeLabel}`, TITLE_MAX),
    subtitle: clipMessengerLabel(
      session.topic || 'IELTS Writing',
      SUBTITLE_MAX,
    ),
  }));

  return [
    {
      kind: 'generic',
      messageType: 'CHAT_SESSIONS_GENERIC',
      elements,
    },
  ];
}

export function buildCalendarEntriesRichFollowUp(
  entries: Array<{
    scheduledTimeLabel: string;
    topic?: string;
  }>,
): MessengerRichFollowUp | undefined {
  if (!entries.length) {
    return undefined;
  }

  return {
    kind: 'generic',
    messageType: 'CHAT_CALENDAR_GENERIC',
    elements: entries.slice(0, MAX_GENERIC_ELEMENTS).map((entry) => ({
      title: clipMessengerLabel(`📅 ${entry.scheduledTimeLabel}`, TITLE_MAX),
      subtitle: clipMessengerLabel(
        entry.topic || 'IELTS Writing',
        SUBTITLE_MAX,
      ),
    })),
  };
}

export function buildUserGoalsRichFollowUp(goals: {
  targetScore: number;
  examDate: string;
}): MessengerRichFollowUp {
  return {
    kind: 'generic',
    messageType: 'CHAT_GOALS_GENERIC',
    elements: [
      {
        title: '🎯 Mục tiêu IELTS',
        subtitle: clipMessengerLabel(
          `Band ${goals.targetScore} · Ngày thi ${goals.examDate}`,
          SUBTITLE_MAX,
        ),
      },
    ],
  };
}

export function buildReminderPreviewRichFollowUp(params: {
  scheduledTimeLabel: string;
  teaser: string;
}): MessengerRichFollowUp {
  return {
    kind: 'generic',
    messageType: 'CHAT_REMINDER_GENERIC',
    elements: [
      {
        title: clipMessengerLabel(`📅 ${params.scheduledTimeLabel}`, TITLE_MAX),
        subtitle: clipMessengerLabel(params.teaser, SUBTITLE_MAX),
      },
    ],
  };
}

export function buildRescheduleSuccessRichFollowUp(params: {
  scheduledTimeLabel: string;
}): MessengerRichFollowUp {
  return {
    kind: 'generic',
    messageType: 'CHAT_RESCHEDULE_GENERIC',
    elements: [
      {
        title: '✅ Đã đổi lịch học',
        subtitle: clipMessengerLabel(params.scheduledTimeLabel, SUBTITLE_MAX),
      },
    ],
  };
}

export interface NormalizedStudySession {
  sessionKey: string;
  scheduledAt: Date;
  topic: string;
  durationMinutes?: number;
}

export type CalendarSessionTimeRange = 'upcoming' | 'past' | 'all';

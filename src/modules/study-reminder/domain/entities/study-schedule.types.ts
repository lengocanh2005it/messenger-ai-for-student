export interface StudySessionRecord {
  id?: string | number;
  sessionId?: string | number;
  scheduledAt?: string;
  scheduled_at?: string;
  startTime?: string;
  start_time?: string;
  dateTime?: string;
  topic?: string;
  subject?: string;
  title?: string;
  durationMinutes?: number;
  duration_minutes?: number;
  status?: string;
}

export interface NormalizedStudySession {
  sessionKey: string;
  scheduledAt: Date;
  topic: string;
  durationMinutes?: number;
}

export interface StudyReminderLlmInput {
  displayName: string;
  scheduledAtIso: string;
  scheduledTimeLabel: string;
  topic: string;
  targetScore?: number;
  task1Band?: number;
  task2Band?: number;
  minutesUntil: number;
}

export interface StudyReminderLlmOutput {
  greeting: string;
  intro: string;
  scheduledTime: string;
  tasks: string[];
  motivation: string;
  signoff: string;
}

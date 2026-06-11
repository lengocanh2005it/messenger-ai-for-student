import { StudyReminderJob } from './study-reminder-job.types';
import { NormalizedStudySession } from './study-schedule.types';

export function buildStudyReminderMessageType(
  session: NormalizedStudySession,
): string {
  return `STUDY_REMINDER:${session.scheduledAt.getTime()}`;
}

export function jobToSession(job: StudyReminderJob): NormalizedStudySession {
  return {
    sessionKey: job.sessionKey,
    scheduledAt: job.scheduledAt,
    topic: job.topic ?? 'IELTS Writing',
  };
}

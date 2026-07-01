import { StudyReminderJob } from './study-reminder-job.types';

export interface StudyReminderOpsSummary {
  countsByStatus: Record<string, number>;
  terminalFailedSince: number;
  stuckProcessing: number;
  failedHours: number;
  stuckProcessingMinutes: number;
  samples: {
    terminalFailed: StudyReminderJob[];
    stuckProcessing: StudyReminderJob[];
  };
}

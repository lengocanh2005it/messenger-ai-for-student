import type { ReportSendJob } from '../entities/report-send-job.types';

export const REPORT_SEND_JOB_REPOSITORY = Symbol('REPORT_SEND_JOB_REPOSITORY');

export interface ReportSendJobRepositoryPort {
  recordRetryableFailure(params: {
    psid: string;
    userId?: number;
    examDate: string;
    firstAttemptDate: string;
    maxRetries: number;
    nextRetryAt: Date;
    errorMessage: string;
  }): Promise<ReportSendJob>;
  findDueJobs(now: Date, limit?: number): Promise<ReportSendJob[]>;
  claimJob(jobId: number): Promise<ReportSendJob | null>;
  markSent(jobId: number): Promise<void>;
  markFailed(params: {
    jobId: number;
    errorMessage: string;
    retryCount: number;
    nextRetryAt?: Date;
    terminal: boolean;
  }): Promise<void>;
  markSentByPsidExamDate(psid: string, examDate: string): Promise<void>;
  resetStuckProcessingJobs(olderThan: Date): Promise<number>;
  countTerminalFailedSince(since: Date): Promise<number>;
}

export const REPORT_CLAIM_REPOSITORY = Symbol('REPORT_CLAIM_REPOSITORY');

export interface ReportClaimRepositoryPort {
  hasSentScheduledReportToday(psid: string): Promise<boolean>;
  tryClaimScheduledReport(params: {
    psid: string;
    userId?: number;
    reportDate: string;
  }): Promise<boolean>;
  markScheduledReportClaimSent(params: {
    psid: string;
    reportDate: string;
  }): Promise<void>;
  releaseScheduledReportClaim(params: {
    psid: string;
    reportDate: string;
  }): Promise<void>;
}

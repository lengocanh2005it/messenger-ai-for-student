export const REPORT_PORT = Symbol('REPORT_PORT');

export interface ReportPort {
  generateReport(psid: string): Promise<string>;
}

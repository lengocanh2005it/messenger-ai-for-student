import { Injectable } from '@nestjs/common';
import type { ReportPort } from '../../domain/ports/report.port';
import { StudentReportService } from '../../../student-report/application/services/student-report.service';

@Injectable()
export class ReportAdapter implements ReportPort {
  constructor(private readonly studentReport: StudentReportService) {}

  generateReport(psid: string): Promise<string> {
    return this.studentReport.generateReport(psid);
  }
}

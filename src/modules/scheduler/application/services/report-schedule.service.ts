import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';

@Injectable()
export class ReportScheduleService {
  constructor(
    private readonly configService: ConfigService,
    private readonly userGoalsApiService: UserGoalsApiService,
  ) {}

  async getDaysUntilExam(psid: string): Promise<number> {
    const goals = await this.userGoalsApiService.getUserGoals(psid);
    const examDateIso = this.userGoalsApiService.parseExamDate(goals.examDate);
    return this.calculateDaysUntilExam(examDateIso, new Date());
  }

  async shouldSendReportToday(psid: string): Promise<{
    shouldSend: boolean;
    daysUntilExam: number;
    examDate: string;
    minDays: number;
    maxDays: number;
  }> {
    const goals = await this.userGoalsApiService.getUserGoals(psid);
    const examDate = this.userGoalsApiService.parseExamDate(goals.examDate);
    const daysUntilExam = this.calculateDaysUntilExam(examDate, new Date());
    const minDays = this.getMinDaysBeforeExam();
    const maxDays = this.getMaxDaysBeforeExam();

    return {
      shouldSend: daysUntilExam >= minDays && daysUntilExam <= maxDays,
      daysUntilExam,
      examDate,
      minDays,
      maxDays,
    };
  }

  getExamReminderWindow(): { minDays: number; maxDays: number } {
    return {
      minDays: this.getMinDaysBeforeExam(),
      maxDays: this.getMaxDaysBeforeExam(),
    };
  }

  calculateDaysUntilExam(examDateIso: string, today: Date): number {
    const [year, month, day] = examDateIso.split('-').map(Number);
    const examStart = new Date(year, month - 1, day);
    const todayStart = this.startOfLocalDay(today);

    return Math.round(
      (examStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  private getMinDaysBeforeExam(): number {
    return Number(
      this.configService.get<string>('WISPACE_REPORT_DAYS_BEFORE_EXAM_MIN') ??
        2,
    );
  }

  private getMaxDaysBeforeExam(): number {
    return Number(
      this.configService.get<string>('WISPACE_REPORT_DAYS_BEFORE_EXAM_MAX') ??
        3,
    );
  }

  private startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
}

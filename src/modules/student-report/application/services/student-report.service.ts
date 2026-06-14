import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { loadSystemPrompt } from '../../../../shared/prompts/load-system-prompt';
import { StudentReportNoScoreDataError } from '../../domain/errors/student-report-no-score-data.error';
import {
  StudentReportRetryableError,
  WispaceApiError,
} from '../../domain/errors/wispace-api.error';
import {
  buildStudentReportApiUnavailableMessage,
  buildStudentReportNoScoreDataMessage,
} from '../messages/student-report.messages';
import { StudentCapacityService } from './student-capacity.service';
import {
  StudentCapacityInput,
  StudentCapacityReport,
} from '../../domain/types/student-capacity.types';

@Injectable()
export class StudentReportService {
  private readonly logger = new Logger(StudentReportService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly studentCapacityService: StudentCapacityService,
  ) {}

  async generateReport(psid: string): Promise<string> {
    try {
      const input = await this.studentCapacityService.getCapacityData(psid);
      const report = await this.generateAiReport(input);
      return this.formatReport(report);
    } catch (error) {
      if (error instanceof StudentReportNoScoreDataError) {
        this.logger.log(
          `No score data for report psid=${psid}; sending R1 guidance message`,
        );
        return buildStudentReportNoScoreDataMessage();
      }

      if (error instanceof WispaceApiError) {
        if (error.isRetryable()) {
          this.logger.warn(
            `Wispace API retryable error for report psid=${psid} status=${error.statusCode} endpoint=${error.endpoint}`,
          );
          throw new StudentReportRetryableError(psid, error);
        }

        this.logger.warn(
          `Wispace API unavailable for report psid=${psid} status=${error.statusCode} endpoint=${error.endpoint}`,
        );
        return buildStudentReportApiUnavailableMessage();
      }

      throw error;
    }
  }

  private async generateAiReport(
    input: StudentCapacityInput,
  ): Promise<StudentCapacityReport> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY missing, using fallback report content');
      return this.buildFallbackReport(input);
    }

    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.4';
    const client = this.getOpenAiClient(apiKey);

    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: loadSystemPrompt('studentReport'),
        },
        {
          role: 'user',
          content: JSON.stringify(input),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new InternalServerErrorException('OpenAI returned empty content');
    }

    return JSON.parse(content) as StudentCapacityReport;
  }

  private buildFallbackReport(
    input: StudentCapacityInput,
  ): StudentCapacityReport {
    const examDate = new Date(input.exam_date);
    const currentDate = new Date(input.current_date);
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (examDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    return {
      headline: `Bạn còn ${daysLeft} ngày nữa đến kỳ thi, mục tiêu band ${input.target_band}.`,
      streak: `Bạn đã làm ${input.total_essays_task1} bài Task 1 và ${input.total_essays_task2} bài Task 2.`,
      'tình trạng task 2': `Task 2 đang ở band ${input.task2_band} — khả năng lập luận tốt.`,
      'tình trạng task 1': `Task 1 đang ở band ${input.task1_band}, thấp hơn mục tiêu ${(input.target_band - input.task1_band).toFixed(1)} band — cần luyện mô tả biểu đồ.`,
    };
  }

  private formatReport(report: StudentCapacityReport): string {
    return [
      report.headline,
      '',
      report.streak,
      '',
      report['tình trạng task 2'],
      report['tình trạng task 1'],
    ].join('\n');
  }

  private getOpenAiClient(apiKey: string): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }
}

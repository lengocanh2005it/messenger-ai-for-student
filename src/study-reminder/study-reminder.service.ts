import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { StudentCapacityService } from '../student-report/student-capacity.service';
import { UserGoalsApiService } from '../student-report/user-goals-api.service';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';
import { StudySessionSourceService } from './study-session-source.service';
import { loadSystemPrompt } from '../prompts/load-system-prompt';
import {
  NormalizedStudySession,
  StudyReminderLlmInput,
  StudyReminderLlmOutput,
} from './study-schedule.types';

@Injectable()
export class StudyReminderService {
  private readonly logger = new Logger(StudyReminderService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly studySessionSourceService: StudySessionSourceService,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
    private readonly userGoalsApiService: UserGoalsApiService,
    private readonly studentCapacityService: StudentCapacityService,
  ) {}

  async generateReminderForSession(
    psid: string,
    session: NormalizedStudySession,
    displayName = 'bạn',
  ): Promise<string> {
    const input = await this.buildLlmInput(psid, session, displayName);
    const output = await this.generateAiReminder(input);
    return this.formatReminder(output);
  }

  async getNextUpcomingSession(
    psid: string,
    userId?: number,
  ): Promise<NormalizedStudySession | null> {
    const sessions = await this.studySessionSourceService.getUpcomingSessions({
      psid,
      userId,
    });
    return sessions[0] ?? null;
  }

  private async buildLlmInput(
    psid: string,
    session: NormalizedStudySession,
    displayName: string,
  ): Promise<StudyReminderLlmInput> {
    const minutesUntil =
      this.studyReminderScheduleService.getMinutesUntilSession(
        session.scheduledAt,
      );
    const scheduledTimeLabel =
      this.studyReminderScheduleService.formatScheduledTimeLabel(
        session.scheduledAt,
      );

    const input: StudyReminderLlmInput = {
      displayName,
      scheduledAtIso: session.scheduledAt.toISOString(),
      scheduledTimeLabel,
      topic: session.topic,
      minutesUntil: Math.round(minutesUntil),
    };

    try {
      const goals = await this.userGoalsApiService.getUserGoals(psid);
      input.targetScore = goals.targetScore;
    } catch (error) {
      this.logger.warn(
        `Could not load user goals for study reminder (psid=${psid}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    try {
      const capacity = await this.studentCapacityService.getCapacityData(psid);
      input.task1Band = capacity.task1_band;
      input.task2Band = capacity.task2_band;
      if (!input.targetScore) {
        input.targetScore = capacity.target_band;
      }
    } catch (error) {
      this.logger.warn(
        `Could not load capacity data for study reminder (psid=${psid}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return input;
  }

  private async generateAiReminder(
    input: StudyReminderLlmInput,
  ): Promise<StudyReminderLlmOutput> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY missing, using fallback study reminder');
      return this.buildFallbackReminder(input);
    }

    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.4';
    const client = this.getOpenAiClient(apiKey);

    const response = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: loadSystemPrompt('studyReminder'),
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

    return JSON.parse(content) as StudyReminderLlmOutput;
  }

  private buildFallbackReminder(
    input: StudyReminderLlmInput,
  ): StudyReminderLlmOutput {
    const tasks = [
      'Ôn lại các bài essay gần đây và feedback',
      `Luyện viết theo chủ đề ${input.topic}`,
      'Tập trung vào điểm cần cải thiện',
    ];

    if (input.targetScore) {
      tasks.push(`Theo dõi tiến độ hướng band mục tiêu ${input.targetScore}`);
    }

    return {
      greeting: `Xin chào ${input.displayName},`,
      intro: 'Đây là lời nhắc thân thiện rằng bạn có buổi học sắp diễn ra:',
      scheduledTime: input.scheduledTimeLabel,
      tasks,
      motivation:
        'Kiên trì luyện tập mỗi ngày sẽ giúp bạn tiến gần hơn tới mục tiêu IELTS. Chỉ cần một buổi ngắn cũng tạo khác biệt lớn!',
      signoff: 'Cố lên nhé! 💪',
    };
  }

  private formatReminder(output: StudyReminderLlmOutput): string {
    const taskLines = output.tasks.map((task) => `• ${task}`).join('\n');

    return [
      '⏰ Time to Study!',
      '',
      output.greeting,
      '',
      output.intro,
      '',
      `📅 ${output.scheduledTime}`,
      '',
      "Don't forget to:",
      taskLines,
      '',
      output.motivation,
      '',
      output.signoff,
    ].join('\n');
  }

  private getOpenAiClient(apiKey: string): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey });
    }

    return this.openai;
  }
}

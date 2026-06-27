import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { loadSystemPrompt } from '../../../../shared/prompts/load-system-prompt';
import { FALLBACK_DISPLAY_NAME } from '../../../../shared/config/poc.constants';
import {
  parseJsonObject,
  readRequiredStringArrayField,
  readRequiredStringField,
} from '../../../../shared/utils/llm-json-output.utils';
import { sanitizeUntrustedTextForLlm } from '../../../../shared/utils/prompt-injection.utils';
import { StudentCapacityService } from '../../../student-report/application/services/student-capacity.service';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';
import {
  NormalizedStudySession,
  StudyReminderLlmInput,
  StudyReminderLlmOutput,
} from '../../domain/entities/study-schedule.types';
import { LlmExecutionService } from '../../../llm-execution/application/services/llm-execution.service';
import { LlmUsageRecorderService } from '../../../llm-usage/application/services/llm-usage-recorder.service';
import { UserDisplayNameService } from './user-display-name.service';
import { StudyReminderScheduleService } from './study-reminder-schedule.service';
import { StudySessionSourceService } from './study-session-source.service';

@Injectable()
export class StudyReminderService {
  private readonly logger = new Logger(StudyReminderService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly studySessionSourceService: StudySessionSourceService,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
    private readonly userGoalsApiService: UserGoalsApiService,
    private readonly studentCapacityService: StudentCapacityService,
    private readonly userDisplayNameService: UserDisplayNameService,
    private readonly llmUsageRecorder: LlmUsageRecorderService,
    private readonly llmExecution: LlmExecutionService,
  ) {}

  async generateReminderForSession(
    psid: string,
    session: NormalizedStudySession,
    options?: { userId?: number; displayName?: string; jobId?: number },
  ): Promise<string> {
    const bundle = await this.generateReminderBundleForSession(
      psid,
      session,
      options,
    );
    return bundle.text;
  }

  async generateReminderBundleForSession(
    psid: string,
    session: NormalizedStudySession,
    options?: { userId?: number; displayName?: string; jobId?: number },
  ): Promise<{ text: string; output: StudyReminderLlmOutput }> {
    const displayName =
      options?.displayName?.trim() ||
      (await this.userDisplayNameService.resolveDisplayName({
        psid,
        userId: options?.userId,
      }));
    const safeDisplayName = this.sanitizeDisplayName(displayName, psid);
    const input = await this.buildLlmInput(psid, session, safeDisplayName);
    const output = await this.generateAiReminder(input, {
      psid,
      userId: options?.userId,
      jobId: options?.jobId,
    });
    return {
      text: this.formatReminder(output),
      output,
    };
  }

  async preloadDisplayNames(userIds: number[]): Promise<void> {
    await this.userDisplayNameService.preloadDisplayNames(userIds);
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
    const topic = this.sanitizeSessionTopic(session.topic, psid);

    const input: StudyReminderLlmInput = {
      displayName,
      scheduledAtIso: session.scheduledAt.toISOString(),
      scheduledTimeLabel,
      topic,
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
    context: { psid: string; userId?: number; jobId?: number },
  ): Promise<StudyReminderLlmOutput> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY missing, using fallback study reminder');
      return this.buildFallbackReminder(input);
    }

    const model = this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-5.4';
    const client = new OpenAI({ apiKey });

    const correlationId =
      context.jobId !== undefined ? String(context.jobId) : context.psid;

    const response = await this.llmExecution.run(
      () =>
        client.chat.completions.create({
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
        }),
      {
        feature: 'STUDY_REMINDER',
        correlationId,
      },
    );

    this.llmUsageRecorder.recordFromCompletion({
      feature: 'STUDY_REMINDER',
      psid: context.psid,
      userId: context.userId,
      model,
      response,
      correlationId,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new InternalServerErrorException('OpenAI returned empty content');
    }

    try {
      return this.parseReminderOutput(content);
    } catch (error) {
      this.logger.warn(
        `Invalid study reminder LLM output psid=${context.psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.buildFallbackReminder(input);
    }
  }

  private parseReminderOutput(content: string): StudyReminderLlmOutput {
    const parsed = parseJsonObject(content);
    return {
      greeting: readRequiredStringField(parsed, 'greeting', { maxChars: 120 }),
      intro: readRequiredStringField(parsed, 'intro', { maxChars: 240 }),
      scheduledTime: readRequiredStringField(parsed, 'scheduledTime', {
        maxChars: 120,
      }),
      tasks: readRequiredStringArrayField(parsed, 'tasks', {
        minItems: 3,
        maxItems: 4,
        maxCharsPerItem: 180,
      }),
      motivation: readRequiredStringField(parsed, 'motivation', {
        maxChars: 500,
      }),
      signoff: readRequiredStringField(parsed, 'signoff', { maxChars: 120 }),
    };
  }

  private sanitizeDisplayName(displayName: string, psid: string): string {
    const sanitized = sanitizeUntrustedTextForLlm(displayName, {
      maxChars: 80,
      unsafePlaceholder: FALLBACK_DISPLAY_NAME,
    });
    if (sanitized.wasSanitized) {
      this.logger.warn(
        `Display name sanitized for study reminder psid=${psid} reason=${sanitized.reason ?? 'format'}`,
      );
    }

    return sanitized.text || FALLBACK_DISPLAY_NAME;
  }

  private sanitizeSessionTopic(topic: string, psid: string): string {
    const sanitized = sanitizeUntrustedTextForLlm(topic || 'IELTS Writing', {
      maxChars: 160,
      unsafePlaceholder: 'IELTS Writing',
    });
    if (sanitized.wasSanitized) {
      this.logger.warn(
        `Session topic sanitized for study reminder psid=${psid} reason=${sanitized.reason ?? 'format'}`,
      );
    }

    return sanitized.text || 'IELTS Writing';
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
      greeting:
        input.displayName.trim() === FALLBACK_DISPLAY_NAME
          ? 'Chào bạn nha,'
          : `Chào ${input.displayName},`,
      intro: 'mình nhắc bạn về buổi luyện IELTS Writing sắp tới nhé.',
      scheduledTime: input.scheduledTimeLabel,
      tasks,
      motivation:
        'Kiên trì luyện tập mỗi ngày sẽ giúp bạn tiến gần hơn tới mục tiêu IELTS. Chỉ cần một buổi ngắn cũng tạo khác biệt lớn!',
      signoff: 'Cố lên nhé! 💪',
    };
  }

  private formatReminder(output: StudyReminderLlmOutput): string {
    const taskLines = output.tasks.map((task) => `• ${task}`).join('\n');
    const opening = [output.greeting, output.intro]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');

    return [
      opening,
      '',
      `📅 ${output.scheduledTime}`,
      '',
      'Gợi ý trước giờ học:',
      taskLines,
      '',
      output.motivation,
      '',
      output.signoff,
    ].join('\n');
  }
}

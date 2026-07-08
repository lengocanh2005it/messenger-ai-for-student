import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MessengerLinkContext,
  buildPocPsidToken,
  getPocAlreadySubscribedMessage,
  getPocSubscriptionConfirmationMessage,
  parseMessengerLinkContext,
} from '../../../../shared/config/poc.constants';
import { StudentReportService } from '../../../student-report/application/services/student-report.service';
import { UserGoalsApiService } from '../../../student-report/infrastructure/wispace/user-goals-api.service';
import {
  getNoUpcomingStudySessionMessage,
  getStudyReminderLeadTimeNotice,
} from '../../../study-reminder/application/messages/study-reminder.messages';
import { StudyReminderScheduleService } from '../../../study-reminder/application/services/study-reminder-schedule.service';
import { StudyReminderService } from '../../../study-reminder/application/services/study-reminder.service';
import { StudyCalendarCommandService } from '../../../study-reminder/application/services/study-calendar-command.service';
import { StudySessionSourceService } from '../../../study-reminder/application/services/study-session-source.service';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import {
  buildCalendarEntriesRichFollowUp,
  buildReminderPreviewRichFollowUp,
  buildStudySessionsRichFollowUps,
  buildUserGoalsRichFollowUp,
} from '../formatters/messenger-rich-message.builder';
import type { MessengerRichFollowUp } from '../../domain/entities/messenger-rich-message.types';
import { sanitizeMessengerText } from '../../../../shared/utils/messenger-text.utils';
import {
  hasExplicitRescheduleTarget,
  isRescheduleIntent,
} from '../../../../shared/utils/messenger-chat-intent.utils';
import {
  isAgentToolName,
  AgentToolName,
  readPositiveLimit,
  readPastDays,
  readCalendarTimeRange,
  readPositiveInteger,
  readSchedulingMode,
  readValidatedDate,
  readValidatedTime,
} from '@wispace/llm-agent';
import type { MessengerAgentReply } from './messenger-agent.service';
import { MessengerRescheduleConfirmationService } from '../services/messenger-reschedule-confirmation.service';

export interface MessengerAgentToolContext {
  psid: string;
  userId?: number;
  linkContext?: MessengerLinkContext;
  richFollowUps: MessengerRichFollowUp[];
}

@Injectable()
export class MessengerAgentToolsService {
  private readonly logger = new Logger(MessengerAgentToolsService.name);

  constructor(
    @Inject(MESSENGER_REPOSITORY)
    private readonly repository: MessengerRepositoryPort,
    private readonly studentReportService: StudentReportService,
    private readonly userGoalsApiService: UserGoalsApiService,
    private readonly studySessionSourceService: StudySessionSourceService,
    private readonly studyReminderService: StudyReminderService,
    private readonly studyReminderScheduleService: StudyReminderScheduleService,
    private readonly studyCalendarCommandService: StudyCalendarCommandService,
    private readonly rescheduleConfirmationService: MessengerRescheduleConfirmationService,
  ) {}

  async tryFastDefaultReschedule(
    ctx: MessengerAgentToolContext,
    userText: string,
  ): Promise<MessengerAgentReply | null> {
    if (!ctx.userId || !isRescheduleIntent(userText)) {
      return null;
    }

    if (hasExplicitRescheduleTarget(userText)) {
      return null;
    }

    const list = await this.studyCalendarCommandService.listEntries(
      ctx.psid,
      ctx.userId,
      { timeRange: 'upcoming' },
    );

    if (list.entries.length !== 1) {
      return null;
    }

    const entry = list.entries[0];

    const staged = await this.rescheduleConfirmationService.stage({
      psid: ctx.psid,
      userId: ctx.userId,
      calendarId: entry.calendarId,
      schedulingMode: 'default_next_day_same_time',
    });

    if ('error' in staged) {
      return null;
    }

    const minutesBefore =
      this.studyReminderScheduleService.getOutboxSettings().minutesBefore;

    return {
      text: sanitizeMessengerText(
        [
          'Mình đã chuẩn bị đổi lịch theo yêu cầu của bạn.',
          'Bấm «Xác nhận đổi lịch» bên dưới để hoàn tất — nếu không muốn đổi nữa thì bấm Hủy nhé.',
          getStudyReminderLeadTimeNotice(minutesBefore),
        ].join('\n\n'),
      ),
      richFollowUps: [staged.richFollowUp],
    };
  }

  async execute(
    toolName: string,
    argsJson: string,
    ctx: MessengerAgentToolContext,
  ): Promise<unknown> {
    if (!isAgentToolName(toolName)) {
      return { error: `Unknown tool: ${toolName}` };
    }

    let args: Record<string, unknown> = {};
    if (argsJson.trim()) {
      try {
        args = JSON.parse(argsJson) as Record<string, unknown>;
      } catch {
        return { error: 'Invalid tool arguments JSON' };
      }
    }

    try {
      return await this.dispatch(toolName, args, ctx);
    } catch (error) {
      this.logger.warn(
        `Tool ${toolName} failed for psid=${ctx.psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        error: error instanceof Error ? error.message : 'Tool execution failed',
      };
    }
  }

  private async dispatch(
    toolName: AgentToolName,
    args: Record<string, unknown>,
    ctx: MessengerAgentToolContext,
  ): Promise<unknown> {
    switch (toolName) {
      case 'get_learning_progress_report': {
        const report = await this.studentReportService.generateReport(ctx.psid);
        return { report };
      }
      case 'get_user_goals': {
        const goals = await this.userGoalsApiService.getUserGoals(ctx.psid);
        this.pushRichFollowUp(ctx, buildUserGoalsRichFollowUp(goals));
        return goals;
      }
      case 'get_upcoming_study_sessions':
        return this.getUpcomingStudySessions(ctx, args);
      case 'list_study_calendar_entries': {
        const timeRange = readCalendarTimeRange(args.timeRange) ?? 'upcoming';
        const list = await this.studyCalendarCommandService.listEntries(
          ctx.psid,
          ctx.userId,
          {
            timeRange,
            limit: readPositiveLimit(args.limit, 10),
            pastDays: readPastDays(args.pastDays),
          },
        );
        this.pushRichFollowUp(
          ctx,
          buildCalendarEntriesRichFollowUp(list.entries),
        );
        const minutesBefore =
          this.studyReminderScheduleService.getOutboxSettings().minutesBefore;

        return {
          ...list,
          reminderNotice:
            list.timeRange === 'upcoming' && list.entries.length > 0
              ? getStudyReminderLeadTimeNotice(minutesBefore)
              : undefined,
        };
      }
      case 'reschedule_study_session':
        return this.rescheduleStudySession(ctx, args);
      case 'preview_next_study_reminder':
        return this.previewNextStudyReminder(ctx);
      case 'register_exam_report_notifications':
        return this.registerExamReportNotifications(ctx);
      default: {
        const unknownTool = toolName as string;
        return { error: `Unhandled tool: ${unknownTool}` };
      }
    }
  }

  private async rescheduleStudySession(
    ctx: MessengerAgentToolContext,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    if (!ctx.userId) {
      return {
        rescheduled: false,
        message:
          'Chưa liên kết tài khoản WISPACE — không thể đổi lịch qua Messenger.',
      };
    }

    const calendarId = readPositiveInteger(args.calendarId);
    if (!calendarId) {
      return { error: 'calendarId is required' };
    }

    const schedulingMode = readSchedulingMode(args.schedulingMode);
    if (!schedulingMode) {
      return {
        error: 'schedulingMode must be default_next_day_same_time or explicit',
      };
    }

    const upcoming = await this.studyCalendarCommandService.listEntries(
      ctx.psid,
      ctx.userId,
      { timeRange: 'upcoming' },
    );
    const matchedEntry = upcoming.entries.find(
      (entry) => entry.calendarId === calendarId,
    );
    if (!matchedEntry) {
      const options = upcoming.entries
        .map((entry) => `${entry.calendarId} (${entry.scheduledTimeLabel})`)
        .join(', ');
      return {
        error: `calendarId ${calendarId} không có trong lịch sắp tới. Dùng đúng id từ list_study_calendar_entries${options ? `: ${options}` : ''}.`,
      };
    }

    const newLocalDate = readValidatedDate(args.newLocalDate);
    const newTime = readValidatedTime(args.newTime);

    if (
      args.newLocalDate !== undefined &&
      args.newLocalDate !== null &&
      !newLocalDate
    ) {
      return { error: 'newLocalDate must be in YYYY-MM-DD format' };
    }

    if (args.newTime !== undefined && args.newTime !== null && !newTime) {
      return { error: 'newTime must be in HH:MM format' };
    }

    const staged = await this.rescheduleConfirmationService.stage({
      psid: ctx.psid,
      userId: ctx.userId,
      calendarId: matchedEntry.calendarId,
      schedulingMode,
      newLocalDate,
      newTime,
    });

    if ('error' in staged) {
      return staged;
    }

    this.pushRichFollowUp(ctx, staged.richFollowUp);

    return {
      pendingConfirmation: true,
      sessionLabel: staged.sessionLabel,
      summary: staged.summary,
      message:
        'Đã gửi nút xác nhận. Chỉ đổi lịch sau khi học viên bấm «Xác nhận đổi lịch» trên Messenger.',
    };
  }

  private async getUpcomingStudySessions(
    ctx: MessengerAgentToolContext,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const limit = readPositiveLimit(args.limit, 5);
    const sessions = await this.studySessionSourceService.getUpcomingSessions({
      psid: ctx.psid,
      userId: ctx.userId,
    });

    const mapped = sessions.slice(0, limit).map((session) => ({
      sessionKey: session.sessionKey,
      topic: session.topic,
      scheduledAtIso: session.scheduledAt.toISOString(),
      scheduledTimeLabel:
        this.studyReminderScheduleService.formatScheduledTimeLabel(
          session.scheduledAt,
        ),
    }));

    this.pushRichFollowUp(ctx, ...buildStudySessionsRichFollowUps(mapped));

    const minutesBefore =
      this.studyReminderScheduleService.getOutboxSettings().minutesBefore;

    return {
      count: sessions.length,
      sessions: mapped,
      reminderNotice:
        mapped.length > 0
          ? getStudyReminderLeadTimeNotice(minutesBefore)
          : undefined,
    };
  }

  private async previewNextStudyReminder(
    ctx: MessengerAgentToolContext,
  ): Promise<unknown> {
    const session = await this.studyReminderService.getNextUpcomingSession(
      ctx.psid,
      ctx.userId,
    );

    if (!session) {
      return {
        hasSession: false,
        message: getNoUpcomingStudySessionMessage(
          this.studyReminderScheduleService.getOutboxSettings().minutesBefore,
        ),
      };
    }

    const bundle =
      await this.studyReminderService.generateReminderBundleForSession(
        ctx.psid,
        session,
        { userId: ctx.userId },
      );

    const scheduledTimeLabel =
      this.studyReminderScheduleService.formatScheduledTimeLabel(
        session.scheduledAt,
      );

    const teaser = [bundle.output.greeting, bundle.output.intro]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');

    this.pushRichFollowUp(
      ctx,
      buildReminderPreviewRichFollowUp({ scheduledTimeLabel, teaser }),
    );

    return {
      hasSession: true,
      scheduledTimeLabel,
      reminder: bundle.text,
    };
  }

  private async registerExamReportNotifications(
    ctx: MessengerAgentToolContext,
  ): Promise<unknown> {
    const linkContext = await this.resolveLinkContext(ctx);
    if (!linkContext) {
      return {
        registered: false,
        message:
          'Chưa liên kết tài khoản WISPACE. Học viên cần mở Messenger từ link trong app WISPACE.',
      };
    }

    const existing = await this.repository.findActiveMappingByPsid(ctx.psid);
    if (
      existing?.cadence === linkContext.cadence &&
      existing?.topic === linkContext.topic
    ) {
      return {
        registered: true,
        alreadyActive: true,
        message: getPocAlreadySubscribedMessage(),
      };
    }

    await this.repository.upsertPocSubscription({
      psid: ctx.psid,
      userId: linkContext.userId,
      cadence: linkContext.cadence,
      topic: linkContext.topic,
      notificationMessagesToken: buildPocPsidToken(ctx.psid),
    });

    return {
      registered: true,
      alreadyActive: false,
      message: getPocSubscriptionConfirmationMessage(),
    };
  }

  private async resolveLinkContext(
    ctx: MessengerAgentToolContext,
  ): Promise<MessengerLinkContext | undefined> {
    if (ctx.linkContext) {
      return ctx.linkContext;
    }

    const mapping = await this.repository.findActiveMappingByPsid(ctx.psid);
    if (!mapping?.userId) {
      return undefined;
    }

    return parseMessengerLinkContext({
      ref: String(mapping.userId),
      topic: mapping.topic,
      cadence: mapping.cadence,
    });
  }

  private pushRichFollowUp(
    ctx: MessengerAgentToolContext,
    ...followUps: Array<MessengerRichFollowUp | undefined>
  ): void {
    for (const followUp of followUps) {
      if (followUp) {
        ctx.richFollowUps.push(followUp);
      }
    }
  }
}

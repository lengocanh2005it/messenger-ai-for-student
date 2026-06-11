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
import type { CalendarSessionTimeRange } from '../../../study-reminder/domain/entities/study-schedule.types';
import type { RescheduleSchedulingMode } from '../../../study-reminder/application/utils/study-calendar.utils';
import { MESSENGER_REPOSITORY } from '../../domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import {
  buildCalendarEntriesRichFollowUp,
  buildReminderPreviewRichFollowUp,
  buildRescheduleSuccessRichFollowUp,
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
  isMessengerAgentToolName,
  MessengerAgentToolName,
} from './messenger-agent.tools';
import type { MessengerAgentReply } from './messenger-agent.service';

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

    try {
      const result = await this.studyCalendarCommandService.rescheduleSession({
        psid: ctx.psid,
        userId: ctx.userId,
        calendarId: entry.calendarId,
        schedulingMode: 'default_next_day_same_time',
      });

      const minutesBefore =
        this.studyReminderScheduleService.getOutboxSettings().minutesBefore;

      return {
        text: sanitizeMessengerText(
          [
            `Mình đã dời buổi học sang ${result.scheduledTimeLabel} cho bạn rồi nhé ✅`,
            getStudyReminderLeadTimeNotice(minutesBefore),
          ].join('\n\n'),
        ),
        richFollowUps: [
          buildRescheduleSuccessRichFollowUp({
            scheduledTimeLabel: result.scheduledTimeLabel,
          }),
        ],
      };
    } catch (error) {
      this.logger.warn(
        `Fast default reschedule failed psid=${ctx.psid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async execute(
    toolName: string,
    argsJson: string,
    ctx: MessengerAgentToolContext,
  ): Promise<unknown> {
    if (!isMessengerAgentToolName(toolName)) {
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
    toolName: MessengerAgentToolName,
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
        const timeRange =
          this.readCalendarTimeRange(args.timeRange) ?? 'upcoming';
        const list = await this.studyCalendarCommandService.listEntries(
          ctx.psid,
          ctx.userId,
          {
            timeRange,
            limit: this.readPositiveLimit(args.limit, 10),
            pastDays: this.readPastDays(args.pastDays),
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
      default:
        return { error: `Unhandled tool: ${toolName}` };
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

    const calendarId = this.readPositiveInteger(args.calendarId);
    if (!calendarId) {
      return { error: 'calendarId is required' };
    }

    const schedulingMode = this.readSchedulingMode(args.schedulingMode);
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

    const result = await this.studyCalendarCommandService.rescheduleSession({
      psid: ctx.psid,
      userId: ctx.userId,
      calendarId: matchedEntry.calendarId,
      schedulingMode,
      newLocalDate: this.readOptionalString(args.newLocalDate),
      newTime: this.readOptionalString(args.newTime),
    });

    this.clearScheduleListFollowUps(ctx);
    this.pushRichFollowUp(
      ctx,
      buildRescheduleSuccessRichFollowUp({
        scheduledTimeLabel: result.scheduledTimeLabel,
      }),
    );

    return {
      rescheduled: true,
      schedulingMode: result.schedulingMode,
      cancelledCalendarId: result.cancelledCalendarId,
      newCalendarId: result.created.id,
      scheduledTimeLabel: result.scheduledTimeLabel,
      outboxSyncQueued: result.outboxSyncQueued,
    };
  }

  private async getUpcomingStudySessions(
    ctx: MessengerAgentToolContext,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const limit = this.readPositiveLimit(args.limit, 5);
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

  /** Drop list cards queued earlier in the same reply (e.g. before reschedule). */
  private clearScheduleListFollowUps(ctx: MessengerAgentToolContext): void {
    const scheduleListTypes = new Set([
      'CHAT_CALENDAR_GENERIC',
      'CHAT_SESSIONS_GENERIC',
    ]);

    ctx.richFollowUps = ctx.richFollowUps.filter(
      (followUp) => !scheduleListTypes.has(followUp.messageType),
    );
  }

  private readPositiveInteger(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return undefined;
    }

    return Math.floor(parsed);
  }

  private readSchedulingMode(
    value: unknown,
  ): RescheduleSchedulingMode | undefined {
    if (value === 'default_next_day_same_time' || value === 'explicit') {
      return value;
    }

    return undefined;
  }

  private readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed || undefined;
  }

  private readPositiveLimit(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.min(Math.floor(parsed), 10);
  }

  private readPastDays(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 90;
    }

    return Math.min(Math.floor(parsed), 365);
  }

  private readCalendarTimeRange(
    value: unknown,
  ): CalendarSessionTimeRange | undefined {
    if (value === 'upcoming' || value === 'past' || value === 'all') {
      return value;
    }

    return undefined;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { isAgentToolName, type AgentToolName } from '@wispace/llm-agent';
import type {
  CalendarSessionTimeRange,
  RescheduleSchedulingMode,
} from '@wispace/wispace-client';
import type { DiscordAgentToolContext } from '../../domain/entities/discord-chat.types';
import { WispaceGoalsService } from '../../../wispace/application/services/wispace-goals.service';
import { WispaceCalendarService } from '../../../wispace/application/services/wispace-calendar.service';
import { DiscordRescheduleConfirmationService } from '../services/discord-reschedule-confirmation.service';
import { DiscordOutboundService } from '../services/discord-outbound.service';

const NOT_LINKED_MESSAGE =
  'Bạn chưa liên kết tài khoản WISPACE với Discord. Vào WISPACE để lấy link "Kết nối Discord" rồi thử lại nhé.';

const NOT_AVAILABLE_MESSAGE =
  'Tính năng này chưa khả dụng trên Discord — bạn dùng WISPACE qua Messenger cho việc này nhé.';

/**
 * Wires the WISPACE tools to real Wispace API calls once the Discord
 * account is linked (`ctx.userId`). `reschedule_study_session` stages a
 * pending change and sends a Discord button confirmation (see
 * `DiscordRescheduleConfirmationService` + `discord-chat.gateway.ts`'s
 * `@Button` handlers) — Discord counterpart to Messenger's postback
 * confirmation flow. `register_exam_report_notifications` stays stubbed:
 * it depends on Messenger's ref-link deep-link mechanism (cadence/topic
 * encoded in the `m.me` referral param) which has no Discord equivalent —
 * needs its own product decision, see docs/turborepo-migration-plan.md
 * Phase 3.
 */
@Injectable()
export class DiscordAgentToolsService {
  private readonly logger = new Logger(DiscordAgentToolsService.name);

  constructor(
    private readonly goalsService: WispaceGoalsService,
    private readonly calendarService: WispaceCalendarService,
    private readonly rescheduleConfirmationService: DiscordRescheduleConfirmationService,
    private readonly outboundService: DiscordOutboundService,
  ) {}

  async execute(
    toolName: string,
    argsJson: string,
    ctx: DiscordAgentToolContext,
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
        `Tool ${toolName} failed for discordUserId=${ctx.discordUserId}: ${
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
    ctx: DiscordAgentToolContext,
  ): Promise<unknown> {
    switch (toolName) {
      case 'get_user_goals':
        return this.withLinkedAccount(ctx, () =>
          this.goalsService.getUserGoals(ctx.discordUserId),
        );
      case 'get_learning_progress_report':
        return this.withLinkedAccount(ctx, async () => {
          const [goals, taskScores] = await Promise.all([
            this.goalsService.getUserGoals(ctx.discordUserId),
            this.goalsService.getTaskScoreAverages(ctx.discordUserId),
          ]);
          return { goals, taskScores };
        });
      case 'get_upcoming_study_sessions':
        return this.withLinkedAccount(ctx, async () => {
          const limit = this.readPositiveLimit(args.limit, 5);
          const sessions = await this.calendarService.getCalendarSessions(
            ctx.discordUserId,
            { timeRange: 'upcoming', limit },
          );
          return {
            count: sessions.length,
            sessions: this.mapSessions(sessions),
          };
        });
      case 'list_study_calendar_entries':
        return this.withLinkedAccount(ctx, async () => {
          const timeRange =
            this.readCalendarTimeRange(args.timeRange) ?? 'upcoming';
          const sessions = await this.calendarService.getCalendarSessions(
            ctx.discordUserId,
            {
              timeRange,
              limit: this.readPositiveLimit(args.limit, 10),
              pastDays: this.readPastDays(args.pastDays),
            },
          );
          return { timeRange, entries: this.mapSessions(sessions) };
        });
      case 'preview_next_study_reminder':
        return this.withLinkedAccount(ctx, async () => {
          const sessions = await this.calendarService.getCalendarSessions(
            ctx.discordUserId,
            { timeRange: 'upcoming', limit: 1 },
          );
          const session = sessions[0];
          return session
            ? { hasSession: true, session: this.mapSessions([session])[0] }
            : { hasSession: false };
        });
      case 'reschedule_study_session':
        return this.withLinkedAccount(ctx, () =>
          this.rescheduleStudySession(ctx, args),
        );
      case 'register_exam_report_notifications':
        this.logger.debug(
          `Tool ${toolName} not yet implemented for discordUserId=${ctx.discordUserId}`,
        );
        return { available: false, message: NOT_AVAILABLE_MESSAGE };
      default: {
        const unknownTool = toolName as string;
        return { error: `Unhandled tool: ${unknownTool}` };
      }
    }
  }

  private async withLinkedAccount(
    ctx: DiscordAgentToolContext,
    fn: () => Promise<unknown>,
  ): Promise<unknown> {
    if (!ctx.userId) {
      return { available: false, message: NOT_LINKED_MESSAGE };
    }

    return fn();
  }

  private mapSessions(
    sessions: Array<{ sessionKey: string; scheduledAt: Date; topic: string }>,
  ) {
    return sessions.map((session) => ({
      sessionKey: session.sessionKey,
      topic: session.topic,
      scheduledAtIso: session.scheduledAt.toISOString(),
    }));
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

  private async rescheduleStudySession(
    ctx: DiscordAgentToolContext,
    args: Record<string, unknown>,
  ): Promise<unknown> {
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

    const newLocalDate = this.readValidatedDate(args.newLocalDate);
    const newTime = this.readValidatedTime(args.newTime);

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
      discordUserId: ctx.discordUserId,
      userId: ctx.userId!,
      calendarId,
      schedulingMode,
      newLocalDate,
      newTime,
    });

    if ('error' in staged) {
      return staged;
    }

    await this.outboundService.sendRescheduleConfirmation(
      ctx.discordUserId,
      staged.summary,
    );

    return {
      pendingConfirmation: true,
      sessionLabel: staged.sessionLabel,
    };
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

  private readValidatedDate(value: unknown): string | undefined {
    const str = this.readOptionalString(value);
    if (!str) return undefined;
    return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : undefined;
  }

  private readValidatedTime(value: unknown): string | undefined {
    const str = this.readOptionalString(value);
    if (!str) return undefined;
    return /^\d{2}:\d{2}$/.test(str) ? str : undefined;
  }
}

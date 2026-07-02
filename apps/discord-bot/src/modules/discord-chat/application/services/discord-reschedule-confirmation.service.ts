import { Injectable, Logger } from '@nestjs/common';
import type { RescheduleSchedulingMode } from '@wispace/wispace-client';
import { DiscordStudyCalendarCommandService } from '../../../wispace/application/services/discord-study-calendar-command.service';
import { PENDING_RESCHEDULE_TTL_MS } from '../constants/discord-reschedule.constants';

interface PendingReschedule {
  discordUserId: string;
  userId: number;
  calendarId: number;
  schedulingMode: RescheduleSchedulingMode;
  newLocalDate?: string;
  newTime?: string;
  sessionLabel: string;
  expiresAt: number;
}

export interface StageRescheduleInput {
  discordUserId: string;
  userId: number;
  calendarId: number;
  schedulingMode: RescheduleSchedulingMode;
  newLocalDate?: string;
  newTime?: string;
}

export interface StageRescheduleResult {
  pendingConfirmation: true;
  sessionLabel: string;
  summary: string;
}

/**
 * Discord counterpart to Messenger's `MessengerRescheduleConfirmationService`
 * — stages a pending reschedule keyed by discordUserId, confirmed/cancelled
 * via Discord message buttons (`reschedule_confirm` / `reschedule_cancel`)
 * instead of Messenger postback payloads.
 */
@Injectable()
export class DiscordRescheduleConfirmationService {
  private readonly logger = new Logger(
    DiscordRescheduleConfirmationService.name,
  );
  private readonly pendingByDiscordUserId = new Map<
    string,
    PendingReschedule
  >();

  constructor(
    private readonly studyCalendarCommandService: DiscordStudyCalendarCommandService,
  ) {}

  async stage(
    input: StageRescheduleInput,
  ): Promise<StageRescheduleResult | { error: string }> {
    const upcoming = await this.studyCalendarCommandService.listEntries(
      input.discordUserId,
      { timeRange: 'upcoming' },
    );
    const matchedEntry = upcoming.entries.find(
      (entry) => entry.calendarId === input.calendarId,
    );
    if (!matchedEntry) {
      const options = upcoming.entries
        .map((entry) => `${entry.calendarId} (${entry.scheduledTimeLabel})`)
        .join(', ');
      return {
        error: `calendarId ${input.calendarId} không có trong lịch sắp tới. Dùng đúng id từ list_study_calendar_entries${options ? `: ${options}` : ''}.`,
      };
    }

    const sessionLabel = matchedEntry.scheduledTimeLabel;
    const summary = this.buildSummary(input, sessionLabel);

    this.pendingByDiscordUserId.set(input.discordUserId, {
      discordUserId: input.discordUserId,
      userId: input.userId,
      calendarId: matchedEntry.calendarId,
      schedulingMode: input.schedulingMode,
      newLocalDate: input.newLocalDate,
      newTime: input.newTime,
      sessionLabel,
      expiresAt: Date.now() + PENDING_RESCHEDULE_TTL_MS,
    });

    this.logger.log(
      `RESCHEDULE_PENDING discordUserId=${input.discordUserId} calendarId=${matchedEntry.calendarId} mode=${input.schedulingMode}`,
    );

    return { pendingConfirmation: true, sessionLabel, summary };
  }

  async confirm(
    discordUserId: string,
    userId?: number,
  ): Promise<
    | { confirmed: true; scheduledTimeLabel: string }
    | { confirmed: false; message: string }
  > {
    const pending = this.takePendingIfValid(discordUserId, userId);
    if (!pending) {
      return {
        confirmed: false,
        message:
          'Không còn yêu cầu đổi lịch đang chờ xác nhận. Bạn nhắn lại nhu cầu đổi lịch nhé.',
      };
    }

    try {
      const result = await this.studyCalendarCommandService.rescheduleSession({
        discordUserId: pending.discordUserId,
        userId: pending.userId,
        calendarId: pending.calendarId,
        schedulingMode: pending.schedulingMode,
        newLocalDate: pending.newLocalDate,
        newTime: pending.newTime,
      });

      this.logger.log(
        `RESCHEDULE_CONFIRMED discordUserId=${discordUserId} calendarId=${pending.calendarId}`,
      );

      return {
        confirmed: true,
        scheduledTimeLabel: result.scheduledTimeLabel,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `RESCHEDULE_CONFIRM_FAILED discordUserId=${discordUserId}: ${message}`,
      );
      return {
        confirmed: false,
        message:
          'Mình chưa đổi được lịch lúc này. Bạn thử lại sau hoặc đổi trực tiếp trên app WISPACE nhé.',
      };
    }
  }

  cancel(discordUserId: string): string {
    this.pendingByDiscordUserId.delete(discordUserId);
    this.logger.log(`RESCHEDULE_CANCELLED discordUserId=${discordUserId}`);
    return 'Đã hủy yêu cầu đổi lịch. Lịch học giữ nguyên nhé.';
  }

  private takePendingIfValid(
    discordUserId: string,
    userId?: number,
  ): PendingReschedule | undefined {
    const pending = this.pendingByDiscordUserId.get(discordUserId);
    if (!pending) {
      return undefined;
    }

    if (pending.expiresAt <= Date.now()) {
      this.pendingByDiscordUserId.delete(discordUserId);
      return undefined;
    }

    if (userId != null && pending.userId !== userId) {
      return undefined;
    }

    this.pendingByDiscordUserId.delete(discordUserId);
    return pending;
  }

  private buildSummary(
    input: StageRescheduleInput,
    sessionLabel: string,
  ): string {
    if (input.schedulingMode === 'explicit') {
      const datePart = input.newLocalDate ? `ngày ${input.newLocalDate}` : '';
      const timePart = input.newTime ? `lúc ${input.newTime}` : '';
      const target = [datePart, timePart].filter(Boolean).join(' ');
      return target
        ? `Dời buổi ${sessionLabel} sang ${target}?`
        : `Dời buổi ${sessionLabel} theo thời gian bạn vừa nêu?`;
    }

    return `Dời buổi ${sessionLabel} sang ngày kế tiếp cùng giờ?`;
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatQuotaOpsService } from '../../../chat-rate-limit/application/services/chat-quota-ops.service';
import { StudyReminderOpsService } from '../../../study-reminder/application/services/study-reminder-ops.service';
import { MESSENGER_REPOSITORY } from '../../../messenger/domain/repositories/messenger.repository.port';
import type { MessengerRepositoryPort } from '../../../messenger/domain/repositories/messenger.repository.port';
import type {
  OpsHealthAlert,
  OpsHealthSnapshot,
} from '../../domain/entities/ops-health.types';

@Injectable()
export class OpsHealthService {
  private readonly logger = new Logger(OpsHealthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly chatQuotaOpsService: ChatQuotaOpsService,
    private readonly studyReminderOpsService: StudyReminderOpsService,
    @Inject(MESSENGER_REPOSITORY)
    private readonly messengerRepository: MessengerRepositoryPort,
  ) {}

  isAlertCronEnabled(): boolean {
    const raw = this.configService
      .get<string>('OPS_HEALTH_ALERT_ENABLED')
      ?.trim()
      .toLowerCase();

    if (!raw) {
      return true;
    }

    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  async collectSnapshot(): Promise<OpsHealthSnapshot> {
    const failedHours = this.readPositiveNumber('OPS_ALERT_FAILED_JOBS_HOURS', 24);
    const stuckProcessingMinutes = this.readPositiveNumber(
      'OPS_ALERT_STUCK_PROCESSING_MINUTES',
      10,
    );
    const denyLookbackHours = this.readPositiveNumber(
      'OPS_ALERT_DENY_LOOKBACK_HOURS',
      24,
    );
    const denySince = new Date(Date.now() - denyLookbackHours * 60 * 60 * 1000);

    const [chatQuotaBase, studyReminder, denyLogs24h] = await Promise.all([
      this.chatQuotaOpsService.getSummary(),
      this.studyReminderOpsService.getSummary({
        failedHours,
        stuckProcessingMinutes,
      }),
      this.messengerRepository.countMessageLogsByTypeSince(
        'CHAT_QUOTA_DENIED',
        denySince,
      ),
    ]);

    const chatQuota = {
      ...chatQuotaBase,
      denyLogs24h,
    };

    const alerts = this.buildAlerts({ chatQuota, studyReminder });

    return {
      generatedAt: new Date().toISOString(),
      chatQuota,
      studyReminder,
      alerts,
    };
  }

  async logSnapshotIfNeeded(): Promise<OpsHealthSnapshot> {
    const snapshot = await this.collectSnapshot();

    if (snapshot.alerts.length > 0) {
      for (const alert of snapshot.alerts) {
        this.logger.warn(`OPS_HEALTH_ALERT code=${alert.code} ${alert.message}`);
      }

      this.logger.warn(
        `OPS_HEALTH_SUMMARY alerts=${snapshot.alerts.length} studyTerminalFailed24h=${snapshot.studyReminder.terminalFailedSince} studyStuckProcessing=${snapshot.studyReminder.stuckProcessing} chatStuckReserved=${snapshot.chatQuota.stuckReserved} chatDenyLogs24h=${snapshot.chatQuota.denyLogs24h}`,
      );
    } else {
      this.logger.log(
        `OPS_HEALTH_OK studyTerminalFailed24h=${snapshot.studyReminder.terminalFailedSince} studyStuckProcessing=${snapshot.studyReminder.stuckProcessing} chatStuckReserved=${snapshot.chatQuota.stuckReserved} chatDenyLogs24h=${snapshot.chatQuota.denyLogs24h}`,
      );
    }

    return snapshot;
  }

  private buildAlerts(input: {
    chatQuota: OpsHealthSnapshot['chatQuota'];
    studyReminder: OpsHealthSnapshot['studyReminder'];
  }): OpsHealthAlert[] {
    const alerts: OpsHealthAlert[] = [];
    const minFailedJobs = this.readPositiveNumber('OPS_ALERT_MIN_FAILED_JOBS', 1);
    const minStuckReserved = this.readPositiveNumber(
      'OPS_ALERT_MIN_STUCK_RESERVED',
      1,
    );
    const minStuckProcessing = this.readPositiveNumber(
      'OPS_ALERT_MIN_STUCK_PROCESSING',
      1,
    );

    if (input.studyReminder.terminalFailedSince >= minFailedJobs) {
      alerts.push({
        code: 'STUDY_REMINDER_TERMINAL_FAILED',
        severity: 'warn',
        message: `${input.studyReminder.terminalFailedSince} terminal failed job(s) in last ${input.studyReminder.failedHours}h`,
      });
    }

    if (input.studyReminder.stuckProcessing >= minStuckProcessing) {
      alerts.push({
        code: 'STUDY_REMINDER_STUCK_PROCESSING',
        severity: 'warn',
        message: `${input.studyReminder.stuckProcessing} job(s) stuck in processing > ${input.studyReminder.stuckProcessingMinutes}m`,
      });
    }

    if (input.chatQuota.stuckReserved >= minStuckReserved) {
      alerts.push({
        code: 'CHAT_QUOTA_STUCK_RESERVED',
        severity: 'warn',
        message: `${input.chatQuota.stuckReserved} idempotency row(s) stuck in reserved`,
      });
    }

    return alerts;
  }

  private readPositiveNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key)?.trim();
    if (!raw) {
      return fallback;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      this.logger.warn(`${key} invalid; using fallback=${fallback}`);
      return fallback;
    }

    return Math.floor(value);
  }
}

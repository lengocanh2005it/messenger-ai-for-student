import { Injectable } from '@nestjs/common';
import { StudyReminderOpsSummary } from '../../domain/entities/study-reminder-ops.types';
import { StudyReminderJobRepository } from '../../infrastructure/persistence/study-reminder-job.repository';

@Injectable()
export class StudyReminderOpsService {
  constructor(
    private readonly studyReminderJobRepository: StudyReminderJobRepository,
  ) {}

  async getSummary(options?: {
    failedHours?: number;
    stuckProcessingMinutes?: number;
    sampleLimit?: number;
  }): Promise<StudyReminderOpsSummary> {
    const failedHours = options?.failedHours ?? 24;
    const stuckProcessingMinutes = options?.stuckProcessingMinutes ?? 10;
    const sampleLimit = options?.sampleLimit ?? 20;
    const failedSince = new Date(Date.now() - failedHours * 60 * 60 * 1000);
    const stuckBefore = new Date(
      Date.now() - stuckProcessingMinutes * 60 * 1000,
    );

    const [
      countsByStatus,
      terminalFailedSince,
      stuckProcessing,
      terminalFailedSamples,
      stuckProcessingSamples,
    ] = await Promise.all([
      this.studyReminderJobRepository.countJobsByStatus(),
      this.studyReminderJobRepository.countTerminalFailedSince(failedSince),
      this.studyReminderJobRepository.countStuckProcessing(stuckBefore),
      this.studyReminderJobRepository.findTerminalFailedSince(
        failedSince,
        sampleLimit,
      ),
      this.studyReminderJobRepository.findStuckProcessing(
        stuckBefore,
        sampleLimit,
      ),
    ]);

    return {
      countsByStatus,
      terminalFailedSince,
      stuckProcessing,
      failedHours,
      stuckProcessingMinutes,
      samples: {
        terminalFailed: terminalFailedSamples,
        stuckProcessing: stuckProcessingSamples,
      },
    };
  }
}

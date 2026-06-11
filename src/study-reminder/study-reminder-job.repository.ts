import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  StudyReminderJobEntity,
  StudyReminderJobStatus,
} from '../database/entities/study-reminder-job.entity';
import {
  StudyReminderJob,
  UpsertStudyReminderJobInput,
} from './study-reminder-job.types';

@Injectable()
export class StudyReminderJobRepository {
  constructor(
    @InjectRepository(StudyReminderJobEntity)
    private readonly jobRepo: Repository<StudyReminderJobEntity>,
  ) {}

  async upsertPendingJob(
    input: UpsertStudyReminderJobInput,
  ): Promise<StudyReminderJob> {
    const existing = await this.jobRepo.findOne({
      where: {
        psid: input.psid,
        sessionKey: input.sessionKey,
      },
    });

    if (!existing) {
      const created = this.jobRepo.create({
        psid: input.psid,
        userId: input.userId ?? null,
        sessionKey: input.sessionKey,
        scheduledAt: input.scheduledAt,
        remindAt: input.remindAt,
        topic: input.topic ?? null,
        status: 'pending',
        retryCount: 0,
        maxRetries: input.maxRetries,
        nextRetryAt: null,
        lastError: null,
        sentAt: null,
      });
      const saved = await this.jobRepo.save(created);
      return this.mapEntity(saved);
    }

    if (existing.status === 'sent' || existing.status === 'cancelled') {
      if (!this.hasScheduleChanged(existing, input)) {
        return this.mapEntity(existing);
      }

      this.applyScheduleUpdate(existing, input);
      existing.status = 'pending';
      existing.retryCount = 0;
      existing.sentAt = null;
      existing.lastError = null;
      existing.nextRetryAt = null;

      const saved = await this.jobRepo.save(existing);
      return this.mapEntity(saved);
    }

    existing.userId = input.userId ?? existing.userId;
    this.applyScheduleUpdate(existing, input);
    existing.maxRetries = input.maxRetries;

    if (existing.status === 'failed') {
      existing.status = 'pending';
      existing.nextRetryAt = null;
      existing.lastError = null;
    }

    const saved = await this.jobRepo.save(existing);
    return this.mapEntity(saved);
  }

  async cancelStaleJobsForPsid(
    psid: string,
    activeSessionKeys: string[],
    horizonEnd: Date,
  ): Promise<number> {
    const qb = this.jobRepo
      .createQueryBuilder()
      .update(StudyReminderJobEntity)
      .set({ status: 'cancelled' })
      .where('psid = :psid', { psid })
      .andWhere('status IN (:...statuses)', {
        statuses: ['pending', 'failed', 'processing'],
      })
      .andWhere('scheduled_at <= :horizonEnd', { horizonEnd });

    if (activeSessionKeys.length > 0) {
      qb.andWhere('session_key NOT IN (:...activeSessionKeys)', {
        activeSessionKeys,
      });
    }

    const result = await qb.execute();
    return result.affected ?? 0;
  }

  async findDueJobs(
    now: Date,
    minLeadMinutes: number,
    limit = 50,
  ): Promise<StudyReminderJob[]> {
    const minScheduledAt = new Date(now.getTime() + minLeadMinutes * 60 * 1000);

    const rows = await this.jobRepo
      .createQueryBuilder('job')
      .where('job.status IN (:...statuses)', {
        statuses: ['pending', 'failed'],
      })
      .andWhere('job.remind_at <= :now', { now })
      .andWhere('job.scheduled_at > :minScheduledAt', { minScheduledAt })
      .andWhere('(job.next_retry_at IS NULL OR job.next_retry_at <= :now)', {
        now,
      })
      .andWhere(
        `(job.status = 'pending' OR (job.status = 'failed' AND job.retry_count < job.max_retries))`,
      )
      .orderBy('job.remind_at', 'ASC')
      .limit(limit)
      .getMany();

    return rows.map((row) => this.mapEntity(row));
  }

  async claimJob(jobId: number): Promise<StudyReminderJob | null> {
    const result = await this.jobRepo.update(
      {
        id: jobId,
        status: In(['pending', 'failed']),
      },
      { status: 'processing' },
    );

    if (!result.affected) {
      return null;
    }

    const row = await this.jobRepo.findOne({ where: { id: jobId } });
    return row ? this.mapEntity(row) : null;
  }

  async markSent(jobId: number): Promise<void> {
    await this.jobRepo.update(jobId, {
      status: 'sent',
      sentAt: new Date(),
      lastError: null,
      nextRetryAt: null,
    });
  }

  async markFailed(params: {
    jobId: number;
    errorMessage: string;
    retryCount: number;
    nextRetryAt?: Date;
    terminal: boolean;
  }): Promise<void> {
    await this.jobRepo.update(params.jobId, {
      status: 'failed',
      retryCount: params.retryCount,
      lastError: params.errorMessage,
      nextRetryAt: params.terminal ? null : (params.nextRetryAt ?? null),
    });
  }

  async markCancelled(jobId: number, reason: string): Promise<void> {
    await this.jobRepo.update(jobId, {
      status: 'cancelled',
      lastError: reason,
      nextRetryAt: null,
    });
  }

  async deleteSentJobs(): Promise<number> {
    const result = await this.jobRepo
      .createQueryBuilder()
      .delete()
      .from(StudyReminderJobEntity)
      .where('status = :status', { status: 'sent' })
      .execute();

    return result.affected ?? 0;
  }

  async deleteTerminalJobsOlderThan(cutoff: Date): Promise<number> {
    const result = await this.jobRepo
      .createQueryBuilder()
      .delete()
      .from(StudyReminderJobEntity)
      .where(
        `(status = 'cancelled' AND updated_at < :cutoff)
         OR (status = 'failed' AND retry_count >= max_retries AND updated_at < :cutoff)`,
        { cutoff },
      )
      .execute();

    return result.affected ?? 0;
  }

  async resetStuckProcessingJobs(olderThan: Date): Promise<number> {
    const result = await this.jobRepo
      .createQueryBuilder()
      .update(StudyReminderJobEntity)
      .set({ status: 'pending' })
      .where('status = :status', { status: 'processing' })
      .andWhere('updated_at <= :olderThan', { olderThan })
      .execute();

    return result.affected ?? 0;
  }

  private hasScheduleChanged(
    existing: StudyReminderJobEntity,
    input: UpsertStudyReminderJobInput,
  ): boolean {
    return (
      existing.scheduledAt.getTime() !== input.scheduledAt.getTime() ||
      existing.remindAt.getTime() !== input.remindAt.getTime() ||
      (input.topic ?? null) !== (existing.topic ?? null)
    );
  }

  private applyScheduleUpdate(
    existing: StudyReminderJobEntity,
    input: UpsertStudyReminderJobInput,
  ): void {
    existing.userId = input.userId ?? existing.userId;
    existing.scheduledAt = input.scheduledAt;
    existing.remindAt = input.remindAt;
    existing.topic = input.topic ?? existing.topic;
    existing.maxRetries = input.maxRetries;
  }

  private mapEntity(entity: StudyReminderJobEntity): StudyReminderJob {
    return {
      id: entity.id,
      psid: entity.psid,
      userId: entity.userId ?? undefined,
      sessionKey: entity.sessionKey,
      scheduledAt: entity.scheduledAt,
      remindAt: entity.remindAt,
      topic: entity.topic ?? undefined,
      status: entity.status,
      retryCount: entity.retryCount,
      maxRetries: entity.maxRetries,
      nextRetryAt: entity.nextRetryAt ?? undefined,
      lastError: entity.lastError ?? undefined,
      sentAt: entity.sentAt ?? undefined,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}

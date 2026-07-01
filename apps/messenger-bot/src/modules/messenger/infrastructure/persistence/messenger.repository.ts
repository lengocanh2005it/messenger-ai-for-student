import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { buildPocPsidToken } from '../../../../shared/config/poc.constants';
import {
  MessengerMessageLogEntity,
  MessengerScheduledReportClaimEntity,
  UserMessengerMappingEntity,
} from '../../../../infrastructure/database/entities';
import { MessengerRepositoryPort } from '../../domain/repositories/messenger.repository.port';
import {
  MessengerMessageLog,
  NotificationCadence,
  UserMessengerMapping,
} from '../../domain/entities/messenger.types';

@Injectable()
export class MessengerRepository implements MessengerRepositoryPort {
  constructor(
    @InjectRepository(UserMessengerMappingEntity)
    private readonly mappingRepo: Repository<UserMessengerMappingEntity>,
    @InjectRepository(MessengerMessageLogEntity)
    private readonly logRepo: Repository<MessengerMessageLogEntity>,
    @InjectRepository(MessengerScheduledReportClaimEntity)
    private readonly reportClaimRepo: Repository<MessengerScheduledReportClaimEntity>,
  ) {}

  async findActiveMappingByPsid(
    psid: string,
  ): Promise<UserMessengerMapping | null> {
    const row = await this.mappingRepo.findOne({
      where: { psid, status: 'ACTIVE' },
    });

    return row ? this.mapEntity(row) : null;
  }

  async findActiveMappingByUserId(
    userId: number,
  ): Promise<UserMessengerMapping | null> {
    const row = await this.mappingRepo.findOne({
      where: { userId, status: 'ACTIVE' },
      order: { id: 'DESC' },
    });

    if (!row?.psid) {
      return null;
    }

    return this.mapEntity(row);
  }

  async upsertPsidUserLink(params: {
    psid: string;
    userId: number;
    topic?: string;
    cadence?: NotificationCadence;
  }): Promise<UserMessengerMapping> {
    const token = buildPocPsidToken(params.psid);
    const existing = await this.mappingRepo.findOne({
      where: { psid: params.psid },
    });

    if (existing) {
      existing.userId = params.userId;
      existing.psid = params.psid;
      existing.notificationMessagesToken =
        existing.notificationMessagesToken || token;
      existing.topic = params.topic ?? existing.topic;
      existing.cadence = params.cadence ?? existing.cadence;
      existing.status = 'ACTIVE';

      const saved = await this.mappingRepo.save(existing);
      return this.mapEntity(saved);
    }

    const created = this.mappingRepo.create({
      userId: params.userId,
      psid: params.psid,
      notificationMessagesToken: token,
      topic: params.topic ?? null,
      cadence: params.cadence ?? null,
      status: 'ACTIVE',
    });

    const saved = await this.mappingRepo.save(created);
    return this.mapEntity(saved);
  }

  async upsertPocSubscription(params: {
    psid: string;
    userId: number;
    cadence: NotificationCadence;
    topic: string;
    notificationMessagesToken: string;
  }): Promise<UserMessengerMapping> {
    const existing =
      (await this.mappingRepo.findOne({
        where: { psid: params.psid },
      })) ??
      (await this.mappingRepo.findOne({
        where: { notificationMessagesToken: params.notificationMessagesToken },
      }));

    if (existing) {
      existing.psid = params.psid;
      existing.userId = params.userId;
      existing.notificationMessagesToken = params.notificationMessagesToken;
      existing.cadence = params.cadence;
      existing.topic = params.topic;
      existing.status = 'ACTIVE';

      const saved = await this.mappingRepo.save(existing);
      return this.mapEntity(saved);
    }

    const created = this.mappingRepo.create({
      userId: params.userId,
      psid: params.psid,
      notificationMessagesToken: params.notificationMessagesToken,
      cadence: params.cadence,
      topic: params.topic,
      status: 'ACTIVE',
    });

    const saved = await this.mappingRepo.save(created);
    return this.mapEntity(saved);
  }

  async upsertFromOptin(params: {
    psid?: string;
    userId?: number;
    notificationMessagesToken: string;
    cadence?: NotificationCadence;
    topic?: string;
  }): Promise<UserMessengerMapping> {
    const resolvedUserId = params.userId;
    const existing =
      (await this.mappingRepo.findOne({
        where: { notificationMessagesToken: params.notificationMessagesToken },
      })) ??
      (params.psid
        ? await this.mappingRepo.findOne({
            where: { psid: params.psid, status: 'ACTIVE' },
            order: { id: 'DESC' },
          })
        : null);

    if (!resolvedUserId) {
      throw new Error('userId is required for upsertFromOptin');
    }

    if (existing) {
      existing.psid = params.psid ?? existing.psid;
      existing.userId = resolvedUserId;
      existing.notificationMessagesToken = params.notificationMessagesToken;
      existing.cadence = params.cadence ?? existing.cadence;
      existing.topic = params.topic ?? existing.topic;
      existing.status = 'ACTIVE';

      const saved = await this.mappingRepo.save(existing);
      if (saved.psid) {
        await this.deactivateDuplicateMappingsForPsid(saved.psid, saved.id);
      }
      return this.mapEntity(saved);
    }

    const created = this.mappingRepo.create({
      userId: resolvedUserId,
      psid: params.psid ?? null,
      notificationMessagesToken: params.notificationMessagesToken,
      cadence: params.cadence ?? null,
      topic: params.topic ?? null,
      status: 'ACTIVE',
    });

    const saved = await this.mappingRepo.save(created);
    if (saved.psid) {
      await this.deactivateDuplicateMappingsForPsid(saved.psid, saved.id);
    }
    return this.mapEntity(saved);
  }

  async findActiveMappingsForCadence(
    cadence: NotificationCadence,
  ): Promise<UserMessengerMapping[]> {
    const rows = await this.mappingRepo.find({
      where: { status: 'ACTIVE', cadence },
      order: { id: 'DESC' },
    });

    return this.dedupeMappingsByPsid(rows.map((row) => this.mapEntity(row)));
  }

  async findActiveSubscribedMappings(): Promise<UserMessengerMapping[]> {
    const rows = await this.mappingRepo
      .createQueryBuilder('mapping')
      .where('mapping.status = :status', { status: 'ACTIVE' })
      .andWhere('mapping.cadence IS NOT NULL')
      .andWhere('mapping.topic IS NOT NULL')
      .orderBy('mapping.id', 'DESC')
      .getMany();

    return this.dedupeMappingsByPsid(rows.map((row) => this.mapEntity(row)));
  }

  private dedupeMappingsByPsid(
    mappings: UserMessengerMapping[],
  ): UserMessengerMapping[] {
    const byPsid = new Map<string, UserMessengerMapping>();

    for (const mapping of mappings) {
      if (!mapping.psid) {
        byPsid.set(`mapping-${mapping.id}`, mapping);
        continue;
      }

      const existing = byPsid.get(mapping.psid);
      if (!existing) {
        byPsid.set(mapping.psid, mapping);
        continue;
      }

      if (
        existing.notificationMessagesToken.startsWith('poc:psid:') &&
        !mapping.notificationMessagesToken.startsWith('poc:psid:')
      ) {
        byPsid.set(mapping.psid, mapping);
      }
    }

    return Array.from(byPsid.values());
  }

  private async deactivateDuplicateMappingsForPsid(
    psid: string,
    keepId: number,
  ): Promise<void> {
    await this.mappingRepo.update(
      {
        psid,
        id: Not(keepId),
        status: 'ACTIVE',
      },
      { status: 'INACTIVE' },
    );
  }

  async cleanupActiveDuplicateMappings(): Promise<number> {
    const result = await this.mappingRepo.manager.query<Array<{ id: number }>>(
      `
      WITH keepers AS (
        SELECT DISTINCT ON (psid) id
        FROM user_messenger_mappings
        WHERE status = 'ACTIVE' AND psid IS NOT NULL
        ORDER BY psid, id DESC
      )
      UPDATE user_messenger_mappings
      SET status = 'INACTIVE', updated_at = now()
      WHERE status = 'ACTIVE'
        AND psid IS NOT NULL
        AND id NOT IN (SELECT id FROM keepers)
      RETURNING id
      `,
    );
    const byPsid = result.length;

    const byUser = await this.mappingRepo.manager.query<Array<{ id: number }>>(
      `
      WITH keepers AS (
        SELECT DISTINCT ON (user_id) id
        FROM user_messenger_mappings
        WHERE status = 'ACTIVE' AND user_id IS NOT NULL
        ORDER BY user_id, id DESC
      )
      UPDATE user_messenger_mappings
      SET status = 'INACTIVE', updated_at = now()
      WHERE status = 'ACTIVE'
        AND user_id IS NOT NULL
        AND id NOT IN (SELECT id FROM keepers)
      RETURNING id
      `,
    );

    return byPsid + byUser.length;
  }

  async deactivateConflictingActiveMappings(params: {
    psid: string;
    userId: number;
  }): Promise<void> {
    await this.mappingRepo.update(
      {
        userId: params.userId,
        psid: Not(params.psid),
        status: 'ACTIVE',
      },
      { status: 'INACTIVE' },
    );

    await this.mappingRepo.update(
      {
        psid: params.psid,
        userId: Not(params.userId),
        status: 'ACTIVE',
      },
      { status: 'INACTIVE' },
    );
  }

  async findActiveMetaTokenMappingByPsid(
    psid: string,
  ): Promise<UserMessengerMapping | null> {
    const row = await this.mappingRepo
      .createQueryBuilder('mapping')
      .where('mapping.psid = :psid', { psid })
      .andWhere('mapping.status = :status', { status: 'ACTIVE' })
      .andWhere('mapping.notification_messages_token NOT LIKE :legacyToken', {
        legacyToken: 'poc:psid:%',
      })
      .getOne();

    return row ? this.mapEntity(row) : null;
  }

  async findActiveMappingsWithPsid(): Promise<UserMessengerMapping[]> {
    const rows = await this.mappingRepo
      .createQueryBuilder('mapping')
      .where('mapping.status = :status', { status: 'ACTIVE' })
      .andWhere('mapping.psid IS NOT NULL')
      .orderBy('mapping.id', 'DESC')
      .getMany();

    return this.dedupeMappingsByPsid(rows.map((row) => this.mapEntity(row)));
  }

  async hasSentScheduledReportToday(psid: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await this.logRepo
      .createQueryBuilder('log')
      .where('log.psid = :psid', { psid })
      .andWhere('log.status = :status', { status: 'SENT' })
      .andWhere(
        `(log.message_type = :primaryType
          OR log.message_type LIKE :partType
          OR log.message_type LIKE :legacyPartType)`,
        {
          primaryType: 'SCHEDULED_LEARNING_REPORT',
          partType: 'SCHEDULED_LEARNING_REPORT_PART_%',
          legacyPartType: 'SCHEDULED_LEARNING_REPORT_PSID_FALLBACK%',
        },
      )
      .andWhere('log.created_at >= :startOfDay', { startOfDay })
      .getCount();

    return count > 0;
  }

  async countMessageLogsByTypeSince(
    messageType: string,
    since: Date,
  ): Promise<number> {
    return this.logRepo
      .createQueryBuilder('log')
      .where('log.message_type = :messageType', { messageType })
      .andWhere('log.created_at >= :since', { since })
      .getCount();
  }

  async deleteMessageLogsOlderThan(cutoff: Date): Promise<number> {
    const result = await this.logRepo.delete({
      createdAt: LessThan(cutoff),
    });

    return result.affected ?? 0;
  }

  async tryClaimScheduledReport(params: {
    psid: string;
    userId?: number;
    reportDate: string;
  }): Promise<boolean> {
    const rows: Array<{ id: number }> =
      await this.reportClaimRepo.manager.query(
        `
        INSERT INTO messenger_scheduled_report_claims (psid, report_date, user_id, status)
        VALUES ($1, $2::date, $3, 'claimed')
        ON CONFLICT (psid, report_date) DO NOTHING
        RETURNING id
      `,
        [params.psid, params.reportDate, params.userId ?? null],
      );

    return rows.length > 0;
  }

  async markScheduledReportClaimSent(params: {
    psid: string;
    reportDate: string;
  }): Promise<void> {
    await this.reportClaimRepo.update(
      {
        psid: params.psid,
        reportDate: params.reportDate,
      },
      { status: 'sent' },
    );
  }

  async releaseScheduledReportClaim(params: {
    psid: string;
    reportDate: string;
  }): Promise<void> {
    await this.reportClaimRepo.update(
      {
        psid: params.psid,
        reportDate: params.reportDate,
        status: 'claimed',
      },
      { status: 'released' },
    );
  }

  async logMessage(params: {
    userId?: number;
    psid?: string;
    messageType: string;
    messageText: string;
    status: 'SENT' | 'FAILED';
    errorMessage?: string;
  }): Promise<MessengerMessageLog> {
    const created = this.logRepo.create({
      userId: params.userId ?? null,
      psid: params.psid ?? null,
      messageType: params.messageType,
      messageText: params.messageText,
      status: params.status,
      errorMessage: params.errorMessage ?? null,
    });

    const saved = await this.logRepo.save(created);
    return this.mapLogEntity(saved);
  }

  private mapEntity(entity: UserMessengerMappingEntity): UserMessengerMapping {
    return {
      id: entity.id,
      userId: entity.userId ?? undefined,
      psid: entity.psid ?? undefined,
      notificationMessagesToken: entity.notificationMessagesToken,
      cadence: entity.cadence ?? undefined,
      topic: entity.topic ?? undefined,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private mapLogEntity(entity: MessengerMessageLogEntity): MessengerMessageLog {
    return {
      id: entity.id,
      userId: entity.userId ?? undefined,
      psid: entity.psid ?? undefined,
      messageType: entity.messageType,
      messageText: entity.messageText,
      status: entity.status,
      errorMessage: entity.errorMessage ?? undefined,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}

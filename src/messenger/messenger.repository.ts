import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { buildPocPsidToken } from '../config/poc.constants';
import { UserMessengerMappingEntity } from '../database/entities';
import {
  MessengerMessageLog,
  NotificationCadence,
  UserMessengerMapping,
} from './types';
import { MessengerMessageLogEntity } from '../database/entities/messenger-message-log.entity';

@Injectable()
export class MessengerRepository {
  constructor(
    @InjectRepository(UserMessengerMappingEntity)
    private readonly mappingRepo: Repository<UserMessengerMappingEntity>,
    @InjectRepository(MessengerMessageLogEntity)
    private readonly logRepo: Repository<MessengerMessageLogEntity>,
  ) {}

  async findActiveMappingByPsid(
    psid: string,
  ): Promise<UserMessengerMapping | null> {
    const row = await this.mappingRepo.findOne({
      where: { psid, status: 'ACTIVE' },
    });

    return row ? this.mapEntity(row) : null;
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
    let existing =
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
    const rows = await this.mappingRepo.find({
      where: { status: 'ACTIVE' },
      order: { id: 'DESC' },
    });
    const keepMappings = this.dedupeMappingsByPsid(
      rows.map((row) => this.mapEntity(row)),
    );
    const keepIds = new Set(keepMappings.map((mapping) => mapping.id));
    let deactivated = 0;

    for (const row of rows) {
      if (keepIds.has(row.id)) {
        continue;
      }

      row.status = 'INACTIVE';
      await this.mappingRepo.save(row);
      deactivated += 1;
    }

    return deactivated;
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

  async hasSentScheduledReportToday(psid: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const count = await this.logRepo
      .createQueryBuilder('log')
      .where('log.psid = :psid', { psid })
      .andWhere('log.status = :status', { status: 'SENT' })
      .andWhere('log.message_type IN (:...types)', {
        types: [
          'SCHEDULED_LEARNING_REPORT',
          'SCHEDULED_LEARNING_REPORT_PSID_FALLBACK',
        ],
      })
      .andWhere('log.created_at >= :startOfDay', { startOfDay })
      .getCount();

    return count > 0;
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

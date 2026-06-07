import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const existing = await this.mappingRepo.findOne({
      where: { notificationMessagesToken: params.notificationMessagesToken },
    });

    if (existing) {
      existing.psid = params.psid ?? existing.psid;
      existing.userId = params.userId ?? existing.userId;
      existing.cadence = params.cadence ?? existing.cadence;
      existing.topic = params.topic ?? existing.topic;
      existing.status = 'ACTIVE';

      const saved = await this.mappingRepo.save(existing);
      return this.mapEntity(saved);
    }

    const created = this.mappingRepo.create({
      userId: params.userId ?? null,
      psid: params.psid ?? null,
      notificationMessagesToken: params.notificationMessagesToken,
      cadence: params.cadence ?? null,
      topic: params.topic ?? null,
      status: 'ACTIVE',
    });

    const saved = await this.mappingRepo.save(created);
    return this.mapEntity(saved);
  }

  async findActiveMappingsForCadence(
    cadence: NotificationCadence,
  ): Promise<UserMessengerMapping[]> {
    const rows = await this.mappingRepo.find({
      where: { status: 'ACTIVE', cadence },
      order: { id: 'ASC' },
    });

    return rows.map((row) => this.mapEntity(row));
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

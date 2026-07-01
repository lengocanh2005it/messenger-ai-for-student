import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('messenger_chat_events')
@Index('idx_chat_events_aggregate_time', ['aggregateId', 'occurredAt'])
@Index('idx_chat_events_usage_date', ['usageDate', 'eventType'])
export class MessengerChatEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 64 })
  aggregateId: string;

  @Column({
    name: 'aggregate_type',
    type: 'varchar',
    length: 32,
    default: 'chat_quota',
  })
  aggregateType: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @Column({
    name: 'occurred_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  occurredAt: Date;

  @Column({ name: 'usage_date', type: 'date' })
  usageDate: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
    unique: true,
  })
  idempotencyKey: string | null;
}

import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type MessengerChatIdempotencyStatus =
  | 'reserved'
  | 'completed'
  | 'refunded';

@Entity('messenger_chat_idempotency')
@Index('idx_chat_idempotency_psid_date', ['psid', 'usageDate'])
export class MessengerChatIdempotencyEntity {
  @PrimaryColumn({ name: 'idempotency_key', type: 'varchar', length: 128 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 64 })
  psid: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'usage_date', type: 'date' })
  usageDate: string;

  @Column({
    name: 'reserved_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  reservedAt: Date;

  @Column({ type: 'varchar', length: 16, default: 'reserved' })
  status: MessengerChatIdempotencyStatus;
}

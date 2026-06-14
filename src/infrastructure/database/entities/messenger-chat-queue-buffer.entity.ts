import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { MessengerLinkContext } from '../../../shared/config/poc.constants';

@Entity('messenger_chat_queue_buffer')
@Index('idx_chat_queue_buffer_flush_after', ['flushAfterAt'], {
  where: 'processing = false AND flush_after_at IS NOT NULL',
})
export class MessengerChatQueueBufferEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  psid: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'link_context', type: 'jsonb', nullable: true })
  linkContext: MessengerLinkContext | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  texts: string[];

  @Column({ name: 'pending_texts', type: 'jsonb', default: () => "'[]'" })
  pendingTexts: string[];

  @Column({
    name: 'last_idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  lastIdempotencyKey: string | null;

  @Column({
    name: 'last_pending_idempotency_key',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  lastPendingIdempotencyKey: string | null;

  @Column({ type: 'boolean', default: false })
  processing: boolean;

  @Column({
    name: 'processing_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  processingStartedAt: Date | null;

  @Column({ name: 'flush_after_at', type: 'timestamptz', nullable: true })
  flushAfterAt: Date | null;

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;
}

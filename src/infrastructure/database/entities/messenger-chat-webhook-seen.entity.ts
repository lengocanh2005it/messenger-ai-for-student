import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('messenger_chat_webhook_seen')
@Index('idx_chat_webhook_seen_seen_at', ['seenAt'])
export class MessengerChatWebhookSeenEntity {
  @PrimaryColumn({ name: 'message_mid', type: 'varchar', length: 128 })
  messageMid: string;

  @Column({ type: 'varchar', length: 64 })
  psid: string;

  @Column({
    name: 'seen_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  seenAt: Date;
}

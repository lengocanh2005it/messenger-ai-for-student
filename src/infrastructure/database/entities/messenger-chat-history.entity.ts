import { Column, Entity, PrimaryColumn } from 'typeorm';

export interface MessengerChatHistoryMessageRecord {
  role: 'user' | 'assistant';
  content: string;
}

@Entity('messenger_chat_history')
export class MessengerChatHistoryEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  psid: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  messages: MessengerChatHistoryMessageRecord[];

  @Column({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;
}

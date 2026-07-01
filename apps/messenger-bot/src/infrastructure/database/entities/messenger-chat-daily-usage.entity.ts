import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('messenger_chat_daily_usage')
@Index('uq_chat_daily_usage_psid_date', ['psid', 'usageDate'], {
  unique: true,
})
export class MessengerChatDailyUsageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  psid: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ name: 'usage_date', type: 'date' })
  usageDate: string;

  @Column({ name: 'free_form_count', type: 'int', default: 0 })
  freeFormCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

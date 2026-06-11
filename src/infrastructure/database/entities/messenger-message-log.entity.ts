import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('messenger_message_logs')
export class MessengerMessageLogEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  psid: string | null;

  @Column({ name: 'message_type', type: 'varchar', length: 50 })
  messageType: string;

  @Column({ name: 'message_text', type: 'text' })
  messageText: string;

  @Column({ type: 'varchar', length: 20 })
  status: 'SENT' | 'FAILED';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

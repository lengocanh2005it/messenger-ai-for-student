import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationCadence } from '../../messenger/types';

@Entity('user_messenger_mappings')
export class UserMessengerMappingEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  psid: string | null;

  @Column({ name: 'notification_messages_token', type: 'text', unique: true })
  notificationMessagesToken: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  cadence: NotificationCadence | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  topic: string | null;

  @Column({ type: 'varchar', length: 10, default: 'ACTIVE' })
  status: 'ACTIVE' | 'INACTIVE';

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

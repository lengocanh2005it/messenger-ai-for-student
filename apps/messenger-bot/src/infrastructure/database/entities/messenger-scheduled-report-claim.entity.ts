import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ScheduledReportClaimStatus = 'claimed' | 'sent' | 'released';

@Entity('messenger_scheduled_report_claims')
@Index(
  'idx_messenger_scheduled_report_claims_psid_date',
  ['psid', 'reportDate'],
  {
    unique: true,
  },
)
export class MessengerScheduledReportClaimEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  psid: string;

  @Column({ name: 'report_date', type: 'date' })
  reportDate: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 20, default: 'claimed' })
  status: ScheduledReportClaimStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

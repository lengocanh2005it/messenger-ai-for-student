import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Maps the shared `chat_daily_usage` table (owned/migrated by
 * `apps/messenger-bot` — see `docs/turborepo-migration-plan.md` Phase 5:
 * only messenger-bot runs `migration:run`). Table already supports
 * `(platform, external_user_id)` since Phase 2.
 */
@Entity('chat_daily_usage')
@Index(
  'uq_chat_daily_usage_platform_external_date',
  ['platform', 'externalUserId', 'usageDate'],
  { unique: true },
)
export class ChatDailyUsageEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 16, default: 'messenger' })
  platform: string;

  @Column({ name: 'external_user_id', type: 'varchar', length: 64 })
  externalUserId: string;

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

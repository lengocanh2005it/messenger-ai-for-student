import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('llm_safety_events')
@Index('idx_llm_safety_created_at', ['createdAt'])
@Index('idx_llm_safety_platform_external', ['platform', 'externalUserId'], {
  where: '"external_user_id" IS NOT NULL',
})
export class LlmSafetyEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 32 })
  feature: string;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 16, default: 'messenger' })
  platform: string;

  @Column({
    name: 'external_user_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  externalUserId: string | null;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({
    name: 'correlation_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  correlationId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;
}

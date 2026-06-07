import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_profiles')
export class UserProfileEntity {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'exam_date', type: 'date', nullable: true })
  examDate: string | null;

  @Column({
    name: 'target_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  targetBand: string | null;

  @Column({
    name: 'task1_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  task1Band: string | null;

  @Column({
    name: 'task2_band',
    type: 'decimal',
    precision: 3,
    scale: 1,
    nullable: true,
  })
  task2Band: string | null;

  @Column({ name: 'total_essays_task1', type: 'int', nullable: true })
  totalEssaysTask1: number | null;

  @Column({ name: 'total_essays_task2', type: 'int', nullable: true })
  totalEssaysTask2: number | null;
}

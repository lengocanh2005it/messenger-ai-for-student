import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('Users')
export class UserEntity {
  @PrimaryColumn({ name: 'Id', type: 'int' })
  id: number;

  @Column({ name: 'TargetScore', type: 'numeric', nullable: true })
  targetScore: string | null;

  @Column({ name: 'ExamDate', type: 'timestamptz', nullable: true })
  examDate: Date | null;

  @Column({ name: 'DisplayName', type: 'text', nullable: true })
  displayName: string | null;
}

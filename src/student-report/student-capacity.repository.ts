import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserProfileEntity } from '../database/entities';
import { StudentCapacityInput } from './student-capacity.types';

interface CapacityRow {
  exam_date: string | Date | null;
  current_date: string | Date;
  target_band: string | number | null;
  task1_band: string | number | null;
  task2_band: string | number | null;
  total_essays_task1: string | number | null;
  total_essays_task2: string | number | null;
}

@Injectable()
export class StudentCapacityRepository {
  private readonly logger = new Logger(StudentCapacityRepository.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserProfileEntity)
    private readonly userProfileRepo: Repository<UserProfileEntity>,
  ) {}

  async getCapacityData(userId: number): Promise<StudentCapacityInput> {
    const row = await this.findCapacityRow(userId);

    if (!row) {
      throw new Error(`Student capacity data not found for user_id=${userId}`);
    }

    return {
      exam_date: this.toDateString(row.exam_date),
      current_date: this.toDateString(row.current_date),
      target_band: this.toNumber(row.target_band),
      task1_band: this.toNumber(row.task1_band),
      task2_band: this.toNumber(row.task2_band),
      total_essays_task1: this.toInteger(row.total_essays_task1),
      total_essays_task2: this.toInteger(row.total_essays_task2),
    };
  }

  async getCapacityFromUserProfile(
    userId: number,
  ): Promise<StudentCapacityInput | null> {
    const profile = await this.userProfileRepo.findOne({
      where: { userId },
    });

    if (!profile) {
      return null;
    }

    return {
      exam_date: this.toDateString(profile.examDate),
      current_date: new Date().toISOString().slice(0, 10),
      target_band: Number(profile.targetBand ?? 0),
      task1_band: Number(profile.task1Band ?? 0),
      task2_band: Number(profile.task2Band ?? 0),
      total_essays_task1: profile.totalEssaysTask1 ?? 0,
      total_essays_task2: profile.totalEssaysTask2 ?? 0,
    };
  }

  private async findCapacityRow(userId: number): Promise<CapacityRow | null> {
    const queries = [
      this.buildEssaysAggregateQuery(),
      this.buildDirectProfileQuery(),
    ];

    for (const sql of queries) {
      try {
        const rows = await this.dataSource.query<CapacityRow[]>(sql, [userId]);
        if (rows[0]) {
          return rows[0];
        }
      } catch (error) {
        this.logger.warn(
          `Capacity query failed for user_id=${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return null;
  }

  private buildEssaysAggregateQuery(): string {
    return `
      SELECT
        up.exam_date,
        CURRENT_DATE AS current_date,
        up.target_band,
        t1.task1_band,
        t2.task2_band,
        t1.total_essays_task1,
        t2.total_essays_task2
      FROM user_profiles up
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(e.overall_band)::numeric, 1) AS task1_band,
          COUNT(*)::int AS total_essays_task1
        FROM essays e
        WHERE e.user_id = up.user_id
          AND UPPER(COALESCE(e.task_type::text, e.essay_type::text, '')) IN (
            'TASK1', 'TASK_1', '1'
          )
      ) t1 ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          ROUND(AVG(e.overall_band)::numeric, 1) AS task2_band,
          COUNT(*)::int AS total_essays_task2
        FROM essays e
        WHERE e.user_id = up.user_id
          AND UPPER(COALESCE(e.task_type::text, e.essay_type::text, '')) IN (
            'TASK2', 'TASK_2', '2'
          )
      ) t2 ON TRUE
      WHERE up.user_id = $1
      LIMIT 1
    `;
  }

  private buildDirectProfileQuery(): string {
    return `
      SELECT
        up.exam_date,
        CURRENT_DATE AS current_date,
        up.target_band,
        up.task1_band,
        up.task2_band,
        up.total_essays_task1,
        up.total_essays_task2
      FROM user_profiles up
      WHERE up.user_id = $1
      LIMIT 1
    `;
  }

  private toDateString(value: string | Date | null | undefined): string {
    if (!value) {
      return new Date().toISOString().slice(0, 10);
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    return String(value).slice(0, 10);
  }

  private toNumber(value: string | number | null | undefined): number {
    return Number(value ?? 0);
  }

  private toInteger(value: string | number | null | undefined): number {
    return Math.trunc(Number(value ?? 0));
  }
}

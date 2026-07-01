import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * PostgreSQL session-level advisory lock helper.
 *
 * Uses a dedicated QueryRunner so the acquire and release calls share the
 * same DB connection (session). Without this, the pool could hand out a
 * different connection for the release, leaving the lock permanently held
 * until the original connection is recycled.
 */
@Injectable()
export class PgAdvisoryLockService {
  private readonly logger = new Logger(PgAdvisoryLockService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Try to acquire a session-level advisory lock, run fn(), then release.
   * Returns null (without calling fn) if another session already holds the lock.
   */
  async withLock<T>(lockId: number, fn: () => Promise<T>): Promise<T | null> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();

    try {
      const rows = (await runner.query(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
        [lockId],
      )) as Array<{ acquired: boolean }>;
      const row = rows[0];

      if (!row?.acquired) {
        this.logger.debug(
          `Advisory lock ${lockId} not acquired — another instance holds it`,
        );
        return null;
      }

      try {
        return await fn();
      } finally {
        await runner.query('SELECT pg_advisory_unlock($1::bigint)', [lockId]);
      }
    } finally {
      await runner.release();
    }
  }
}

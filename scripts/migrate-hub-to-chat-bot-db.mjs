#!/usr/bin/env node
/**
 * Copy POC tables: writing_ai_hub_db -> ai_chat_bot_db.
 *
 * Uses two pg clients (dblink from inside the PG server cannot reach peer DBs on this host).
 *
 * Prereq: migrations on target (incl. users + "Users" view).
 *
 *   DB_PASSWORD=... node scripts/migrate-hub-to-chat-bot-db.mjs
 *
 * Optional: DB_HOST, DB_PORT, DB_USER, SOURCE_DB_NAME, TARGET_DB_NAME
 */
import pg from 'pg';

const { Client } = pg;

const host = process.env.DB_HOST ?? '69.62.74.196';
const port = Number(process.env.DB_PORT ?? 5434);
const user = process.env.DB_USER ?? 'ielts_admin';
const password = process.env.DB_PASSWORD;
const sourceDb = process.env.SOURCE_DB_NAME ?? 'writing_ai_hub_db';
const targetDb = process.env.TARGET_DB_NAME ?? 'ai_chat_bot_db';

if (!password) {
  console.error('DB_PASSWORD is required');
  process.exit(1);
}

const baseCfg = { host, port, user, password, ssl: false, connectionTimeoutMillis: 30000 };

const SERIAL_TABLES = [
  { table: 'user_messenger_mappings', column: 'id' },
  { table: 'messenger_message_logs', column: 'id' },
  { table: 'study_reminder_jobs', column: 'id' },
  { table: 'messenger_chat_daily_usage', column: 'id' },
  { table: 'messenger_scheduled_report_claims', column: 'id' },
  { table: 'messenger_webhook_dead_letters', column: 'id' },
  { table: 'report_send_jobs', column: 'id' },
];

async function countRows(client, sql) {
  const result = await client.query(sql);
  return result.rows[0].c;
}

async function copyTable(source, target, label, selectSql, insertSql) {
  const rows = await source.query(selectSql);
  if (rows.rows.length === 0) {
    console.log(`  ${label}: 0 rows (skip)`);
    return 0;
  }

  for (const row of rows.rows) {
    await target.query(insertSql, Object.values(row));
  }
  console.log(`  ${label}: ${rows.rows.length} rows`);
  return rows.rows.length;
}

async function truncateTarget(target) {
  await target.query(`
    TRUNCATE TABLE
      messenger_chat_idempotency,
      messenger_chat_daily_usage,
      messenger_webhook_dead_letters,
      messenger_scheduled_report_claims,
      report_send_jobs,
      study_reminder_jobs,
      messenger_message_logs,
      user_messenger_mappings,
      users
    RESTART IDENTITY CASCADE
  `);
  console.log('Cleared target tables');
}

async function main() {
  const source = new Client({ ...baseCfg, database: sourceDb });
  const target = new Client({ ...baseCfg, database: targetDb });

  await source.connect();
  await target.connect();
  console.log(`Copy ${sourceDb} -> ${targetDb}`);

  try {
    await target.query('BEGIN');
    await truncateTarget(target);
    await copyTable(
      source,
      target,
      'user_messenger_mappings',
      `SELECT id, user_id, psid, notification_messages_token,
              cadence, topic, status, created_at, updated_at
       FROM user_messenger_mappings ORDER BY id`,
      `INSERT INTO user_messenger_mappings (
         id, user_id, psid, notification_messages_token,
         cadence, topic, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    );

    await copyTable(
      source,
      target,
      'messenger_message_logs',
      `SELECT id, user_id, psid, message_type, message_text, status, error_message, created_at
       FROM messenger_message_logs ORDER BY id`,
      `INSERT INTO messenger_message_logs (
         id, user_id, psid, message_type, message_text, status, error_message, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    );

    await copyTable(
      source,
      target,
      'study_reminder_jobs',
      `SELECT id, psid, user_id, session_key, scheduled_at, remind_at, topic, status,
              retry_count, max_retries, next_retry_at, last_error, sent_at, created_at, updated_at
       FROM study_reminder_jobs ORDER BY id`,
      `INSERT INTO study_reminder_jobs (
         id, psid, user_id, session_key, scheduled_at, remind_at, topic, status,
         retry_count, max_retries, next_retry_at, last_error, sent_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    );

    await copyTable(
      source,
      target,
      'messenger_chat_daily_usage',
      `SELECT id, psid, user_id, usage_date, free_form_count, created_at, updated_at
       FROM messenger_chat_daily_usage ORDER BY id`,
      `INSERT INTO messenger_chat_daily_usage (
         id, psid, user_id, usage_date, free_form_count, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    );

    await copyTable(
      source,
      target,
      'messenger_chat_idempotency',
      `SELECT idempotency_key, psid, user_id, usage_date, reserved_at, status
       FROM messenger_chat_idempotency`,
      `INSERT INTO messenger_chat_idempotency (
         idempotency_key, psid, user_id, usage_date, reserved_at, status
       ) VALUES ($1,$2,$3,$4,$5,$6)`,
    );

    await copyTable(
      source,
      target,
      'messenger_scheduled_report_claims',
      `SELECT id, psid, report_date, user_id, status, created_at, updated_at
       FROM messenger_scheduled_report_claims ORDER BY id`,
      `INSERT INTO messenger_scheduled_report_claims (
         id, psid, report_date, user_id, status, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    );

    await copyTable(
      source,
      target,
      'messenger_webhook_dead_letters',
      `SELECT id, psid, message_mid, raw_payload, error_message,
              retry_count, status, replayed_at, created_at, updated_at
       FROM messenger_webhook_dead_letters ORDER BY id`,
      `INSERT INTO messenger_webhook_dead_letters (
         id, psid, message_mid, raw_payload, error_message,
         retry_count, status, replayed_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    );

    await copyTable(
      source,
      target,
      'report_send_jobs',
      `SELECT id, psid, user_id, exam_date, first_attempt_date, status,
              retry_count, max_retries, next_retry_at, last_error, sent_at, created_at, updated_at
       FROM report_send_jobs ORDER BY id`,
      `INSERT INTO report_send_jobs (
         id, psid, user_id, exam_date, first_attempt_date, status,
         retry_count, max_retries, next_retry_at, last_error, sent_at, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    );

    const mappingUserIds = await source.query(
      `SELECT DISTINCT user_id
       FROM user_messenger_mappings
       WHERE user_id IS NOT NULL`,
    );
    const mappedIds = mappingUserIds.rows.map((row) => row.user_id);

    if (mappedIds.length === 0) {
      console.log('  users: 0 rows (no messenger mappings)');
    } else {
      const users = await source.query(
        `SELECT "Id", "DisplayName", "ExamDate"
         FROM "Users"
         WHERE "Id" = ANY($1::int[])`,
        [mappedIds],
      );
      const batchSize = 200;
      for (let i = 0; i < users.rows.length; i += batchSize) {
        const chunk = users.rows.slice(i, i + batchSize);
        const ids = chunk.map((r) => r.Id);
        const names = chunk.map((r) => r.DisplayName);
        const exams = chunk.map((r) => r.ExamDate);
        await target.query(
          `INSERT INTO users (user_id, display_name, exam_date)
           SELECT * FROM UNNEST($1::int[], $2::text[], $3::timestamptz[])
           ON CONFLICT (user_id) DO UPDATE SET
             display_name = EXCLUDED.display_name,
             exam_date = EXCLUDED.exam_date,
             updated_at = now()`,
          [ids, names, exams],
        );
      }
      console.log(
        `  users (mapped only): ${users.rows.length}/${mappedIds.length} messenger user_id(s)`,
      );
    }

    for (const { table, column } of SERIAL_TABLES) {
      await target.query(
        `SELECT setval(
           pg_get_serial_sequence($1, $2),
           COALESCE((SELECT MAX("${column}") FROM "${table}"), 1),
           (SELECT COUNT(*) > 0 FROM "${table}")
         )`,
        [table, column],
      );
    }

    await target.query('COMMIT');

    console.log('\nVerification (target):');
    const checks = [
      ['user_messenger_mappings', 'SELECT COUNT(*)::int AS c FROM user_messenger_mappings'],
      ['messenger_message_logs', 'SELECT COUNT(*)::int AS c FROM messenger_message_logs'],
      ['study_reminder_jobs', 'SELECT COUNT(*)::int AS c FROM study_reminder_jobs'],
      ['messenger_chat_daily_usage', 'SELECT COUNT(*)::int AS c FROM messenger_chat_daily_usage'],
      ['messenger_chat_idempotency', 'SELECT COUNT(*)::int AS c FROM messenger_chat_idempotency'],
      ['users', 'SELECT COUNT(*)::int AS c FROM users'],
      ['Users (view)', 'SELECT COUNT(*)::int AS c FROM "Users"'],
    ];
    for (const [name, sql] of checks) {
      console.log(`  ${name}: ${await countRows(target, sql)} rows`);
    }
  } catch (error) {
    await target.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await source.end();
    await target.end();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});

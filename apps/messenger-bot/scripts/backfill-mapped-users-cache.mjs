#!/usr/bin/env node
/**
 * Backfill users cache for mapped user_id(s) missing from `users` table.
 * Reads display name from Wispace hub DB "Users".
 */
import pg from 'pg';

const { Client } = pg;

const requireEnv = (key) => {
  const value = process.env[key]?.trim();
  if (!value) {
    console.error(`${key} is required`);
    process.exit(1);
  }
  return value;
};

const host = requireEnv('DB_HOST');
const port = Number(process.env.DB_PORT ?? 5432);
const user = requireEnv('DB_USER');
const password = process.env.DB_PASSWORD;
const targetDb = process.env.DB_NAME ?? process.env.TARGET_DB_NAME ?? 'ai_chat_bot_db';
const sourceDb = process.env.SOURCE_DB_NAME ?? 'writing_ai_hub_db';

if (!password) {
  console.error('DB_PASSWORD is required');
  process.exit(1);
}

const baseCfg = { host, port, user, password, ssl: false };

const target = new Client({ ...baseCfg, database: targetDb });
const source = new Client({ ...baseCfg, database: sourceDb });

await target.connect();
await source.connect();

const mappings = await target.query(
  `SELECT DISTINCT user_id FROM user_messenger_mappings WHERE user_id IS NOT NULL`,
);
const mappedIds = mappings.rows.map((row) => row.user_id);

const existing = await target.query(
  `SELECT user_id FROM users WHERE user_id = ANY($1::int[])`,
  [mappedIds],
);
const existingIds = new Set(existing.rows.map((row) => row.user_id));
const missingIds = mappedIds.filter((id) => !existingIds.has(id));

if (missingIds.length === 0) {
  console.log(`users cache OK: ${existingIds.size}/${mappedIds.length} mapped user(s)`);
  await target.end();
  await source.end();
  process.exit(0);
}

const wispaceUsers = await source.query(
  `SELECT "Id", "DisplayName", "ExamDate" FROM "Users" WHERE "Id" = ANY($1::int[])`,
  [missingIds],
);

for (const row of wispaceUsers.rows) {
  await target.query(
    `INSERT INTO users (user_id, display_name, exam_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       exam_date = EXCLUDED.exam_date,
       updated_at = now()`,
    [row.Id, row.DisplayName, row.ExamDate],
  );
}

const notInWispace = missingIds.filter(
  (id) => !wispaceUsers.rows.some((row) => row.Id === id),
);
if (notInWispace.length > 0) {
  console.warn(
    `No Wispace "Users" row for mapped user_id(s): ${notInWispace.join(', ')}`,
  );
}

const total = await target.query(`SELECT COUNT(*)::int AS c FROM users`);
console.log(
  `Backfilled ${wispaceUsers.rows.length} user(s); users table now ${total.rows[0].c} row(s) for ${mappedIds.length} mapping(s)`,
);

await target.end();
await source.end();

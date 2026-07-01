#!/usr/bin/env node
/**
 * Drop POC Messenger tables from writing_ai_hub_db (after migrate to ai_chat_bot_db).
 *
 *   DB_PASSWORD=... node scripts/drop-poc-tables-old-db.mjs
 */
import pg from 'pg';

const { Client } = pg;

const POC_TABLES = [
  'messenger_chat_webhook_seen',
  'messenger_chat_history',
  'messenger_chat_queue_buffer',
  'messenger_chat_idempotency',
  'messenger_chat_daily_usage',
  'messenger_webhook_dead_letters',
  'messenger_scheduled_report_claims',
  'report_send_jobs',
  'study_reminder_jobs',
  'messenger_message_logs',
  'user_messenger_mappings',
];

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
const database = process.env.SOURCE_DB_NAME ?? 'writing_ai_hub_db';

if (!password) {
  console.error('DB_PASSWORD is required');
  process.exit(1);
}

const client = new Client({
  host,
  port,
  user,
  password,
  database,
  ssl: false,
  connectionTimeoutMillis: 30000,
});

await client.connect();
console.log(`Connected to ${database}`);

console.log('\nBefore drop:');
for (const table of POC_TABLES) {
  const exists = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  if (!exists.rows[0].reg) {
    console.log(`  ${table}: (missing)`);
    continue;
  }
  const count = await client.query(`SELECT COUNT(*)::int AS c FROM "${table}"`);
  console.log(`  ${table}: ${count.rows[0].c} rows`);
}

const list = POC_TABLES.map((t) => `"${t}"`).join(',\n  ');
await client.query(`DROP TABLE IF EXISTS\n  ${list}\nCASCADE`);

console.log('\nAfter drop:');
for (const table of POC_TABLES) {
  const exists = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${table}`]);
  console.log(`  ${table}: ${exists.rows[0].reg ? 'STILL EXISTS' : 'dropped'}`);
}

const users = await client.query(`SELECT to_regclass('public."Users"') AS reg`);
console.log(`\nWispace "Users" table: ${users.rows[0].reg ? 'kept' : 'missing'}`);

const migBefore = await client.query(`SELECT to_regclass('public.migrations') AS reg`);
if (migBefore.rows[0].reg) {
  const rows = await client.query('SELECT id, name FROM migrations ORDER BY id');
  console.log(`\nmigrations table: ${rows.rows.length} row(s)`);
  for (const row of rows.rows) {
    console.log(`  ${row.id}: ${row.name}`);
  }
  await client.query('DROP TABLE IF EXISTS migrations CASCADE');
  console.log('migrations table: dropped');
} else {
  console.log('\nmigrations table: already missing');
}

await client.end();
console.log('\nDone.');

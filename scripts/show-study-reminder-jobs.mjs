import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const result = await pool.query(`
  SELECT id, psid, user_id, session_key, scheduled_at, remind_at, topic, status, retry_count
  FROM study_reminder_jobs
  ORDER BY scheduled_at
`);

console.log(JSON.stringify(result.rows, null, 2));
await pool.end();

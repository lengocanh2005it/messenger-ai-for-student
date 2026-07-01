import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5434),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const client = await pool.connect();

async function run(label, sql, params = []) {
  console.log(`\n--- ${label} ---`);
  try {
    const result = await client.query(sql, params);
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error) {
    console.log('ERR', error.message);
  }
}

try {
  await run(
    'writing_task1 count usersid 595',
    'SELECT COUNT(*)::int AS count FROM writing_task1 WHERE usersid = $1',
    [595],
  );
  await run(
    'writing_task2 count usersid 595',
    'SELECT COUNT(*)::int AS count FROM writing_task2 WHERE usersid = $1',
    [595],
  );
  await run(
    'TaskHistories 595',
    'SELECT "Id", "UserId", "Score", "Score1", "Score2", "AiScore", "Created" FROM "TaskHistories" WHERE "UserId" = $1 ORDER BY "Created" DESC LIMIT 5',
    [595],
  );
  await run(
    'TaskHistories aggregate 595',
    `SELECT COUNT(*)::int AS total,
            ROUND(AVG("Score1")::numeric, 1) AS avg_task1,
            ROUND(AVG("Score2")::numeric, 1) AS avg_task2
     FROM "TaskHistories" WHERE "UserId" = $1`,
    [595],
  );
  await run(
    'Users with TargetScore sample',
    'SELECT "Id", "TargetScore", "ExamDate" FROM "Users" WHERE "TargetScore" IS NOT NULL LIMIT 5',
  );
  await run(
    'WritingEvaluations via TaskHistories 595',
    `SELECT th."Id" AS history_id, th."Score", th."WritingTask1Id", th."WritingTask2Id",
            we."OverallScore", we."TaskType"
     FROM "TaskHistories" th
     LEFT JOIN "WritingEvaluations" we
       ON (we."WritingTask1Id" = th."WritingTask1Id" AND th."WritingTask1Id" IS NOT NULL)
       OR (we."WritingTask2Id" = th."WritingTask2Id" AND th."WritingTask2Id" IS NOT NULL)
     WHERE th."UserId" = $1`,
    [595],
  );
  await run(
    'TaskScoreAverages columns',
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'TaskScoreAverages' ORDER BY ordinal_position`,
  );
} finally {
  client.release();
  await pool.end();
}

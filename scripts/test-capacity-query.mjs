import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5434),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const sql = `
  SELECT
    u."ExamDate" AS exam_date,
    CURRENT_DATE AS current_date,
    COALESCE(NULLIF(u."TargetScore"::text, '')::float, 6.0) AS target_band,
    COALESCE((
      SELECT ROUND(AVG(we."OverallScore")::numeric, 1)
      FROM "TaskHistories" th
      JOIN "WritingEvaluations" we
        ON we."WritingTask1Id" = th."WritingTask1Id"
      WHERE th."UserId" = u."Id"
        AND th."WritingTask1Id" IS NOT NULL
    ), 0) AS task1_band,
    COALESCE((
      SELECT ROUND(AVG(we."OverallScore")::numeric, 1)
      FROM "TaskHistories" th
      JOIN "WritingEvaluations" we
        ON we."WritingTask2Id" = th."WritingTask2Id"
      WHERE th."UserId" = u."Id"
        AND th."WritingTask2Id" IS NOT NULL
    ), 0) AS task2_band,
    (
      SELECT COUNT(*)::int
      FROM writing_task1 wt1
      WHERE wt1.usersid = u."Id"
    ) AS total_essays_task1,
    (
      SELECT COUNT(*)::int
      FROM writing_task2 wt2
      WHERE wt2.usersid = u."Id"
    ) AS total_essays_task2
  FROM "Users" u
  WHERE u."Id" = $1
`;

const result = await pool.query(sql, [595]);
console.log(JSON.stringify(result.rows[0], null, 2));
await pool.end();

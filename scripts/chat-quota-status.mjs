import pg from 'pg';

function parseArgs(argv) {
  const args = {
    psid: null,
    userId: null,
    date: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--psid=')) {
      args.psid = arg.slice('--psid='.length).trim();
    } else if (arg.startsWith('--user-id=')) {
      const value = Number(arg.slice('--user-id='.length));
      if (!Number.isFinite(value)) {
        throw new Error('--user-id must be a number');
      }
      args.userId = value;
    } else if (arg.startsWith('--date=')) {
      args.date = arg.slice('--date='.length).trim();
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run chat-quota:status -- [options]

Options:
  --psid=<psid>         Filter by Messenger PSID
  --user-id=<number>    Filter by WISPACE user_id
  --date=YYYY-MM-DD     Usage date (ICT calendar day). Default: today per CHAT_USAGE_TIMEZONE
  -h, --help            Show this help
`);
}

function todayUsageDate(timezone, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function readPositiveNumber(key, fallback = null) {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive number in .env`);
  }

  return value;
}

function readEnabledFlag() {
  const raw = process.env.CHAT_RATE_LIMIT_ENABLED?.trim().toLowerCase();
  if (!raw) {
    return false;
  }

  return raw === 'true' || raw === '1' || raw === 'yes';
}

function readWhitelist() {
  const raw = process.env.CHAT_RATE_LIMIT_WHITELIST_PSIDS?.trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((psid) => psid.trim())
    .filter((psid) => psid.length > 0);
}

const args = parseArgs(process.argv.slice(2));
const timezone =
  process.env.CHAT_USAGE_TIMEZONE?.trim() ?? 'Asia/Ho_Chi_Minh';
const usageDate = args.date ?? todayUsageDate(timezone);
const dailyLimit = readPositiveNumber('CHAT_FREE_FORM_DAILY_LIMIT', 15);
const burstPerMinute = readPositiveNumber('CHAT_BURST_PER_MINUTE', 3);
const remainingHintThreshold = readPositiveNumber(
  'CHAT_QUOTA_REMAINING_HINT_THRESHOLD',
  3,
);

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:
    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  const dailyUsageResult = await pool.query(
    `
      SELECT
        id,
        psid,
        user_id,
        usage_date,
        free_form_count,
        created_at,
        updated_at
      FROM messenger_chat_daily_usage
      WHERE ($1::varchar IS NULL OR psid = $1)
        AND ($2::int IS NULL OR user_id = $2)
        AND usage_date = $3::date
      ORDER BY psid ASC
    `,
    [args.psid, args.userId, usageDate],
  );

  const idempotencyResult = await pool.query(
    `
      SELECT
        idempotency_key,
        psid,
        user_id,
        usage_date,
        status,
        reserved_at
      FROM messenger_chat_idempotency
      WHERE ($1::varchar IS NULL OR psid = $1)
        AND ($2::int IS NULL OR user_id = $2)
        AND usage_date = $3::date
      ORDER BY reserved_at DESC
      LIMIT 100
    `,
    [args.psid, args.userId, usageDate],
  );

  const burstResult = await pool.query(
    `
      SELECT COUNT(*)::int AS recent_count
      FROM messenger_chat_idempotency
      WHERE ($1::varchar IS NULL OR psid = $1)
        AND reserved_at > NOW() - INTERVAL '1 minute'
    `,
    [args.psid],
  );

  const summary = dailyUsageResult.rows.map((row) => ({
    psid: row.psid,
    userId: row.user_id,
    usageDate: row.usage_date,
    used: row.free_form_count,
    limit: dailyLimit,
    remaining: Math.max(dailyLimit - row.free_form_count, 0),
    whitelisted: readWhitelist().includes(row.psid),
  }));

  console.log(
    JSON.stringify(
      {
        filters: {
          psid: args.psid,
          userId: args.userId,
          usageDate,
        },
        config: {
          enabled: readEnabledFlag(),
          dailyLimit,
          burstPerMinute,
          remainingHintThreshold,
          timezone,
          whitelistedPsids: readWhitelist(),
        },
        runbook: {
          recommendedPoc: {
            dailyLimit: '15-20',
            burstPerMinute: 3,
          },
          note: 'Bật CHAT_RATE_LIMIT_ENABLED=true trên production POC sau khi QA xong.',
        },
        summary,
        burstLastMinute: args.psid ? burstResult.rows[0]?.recent_count ?? 0 : null,
        dailyUsage: dailyUsageResult.rows,
        idempotency: idempotencyResult.rows,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}

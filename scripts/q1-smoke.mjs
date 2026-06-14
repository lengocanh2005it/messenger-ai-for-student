const baseUrl = (process.env.Q1_SMOKE_BASE_URL ?? process.env.BASE_URL ?? 'http://127.0.0.1:3000')
  .trim()
  .replace(/\/$/, '');

async function main() {
  const checks = [];

  checks.push(await checkHealthDb());
  checks.push(checkLocalProdQuotaEnv());

  const failed = checks.filter((check) => !check.ok);

  for (const check of checks) {
    const prefix = check.ok ? '[OK]' : '[FAIL]';
    console.log(`${prefix} ${check.name}: ${check.detail}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
    console.error(`Q1 smoke failed (${failed.length}/${checks.length})`);
    return;
  }

  console.log(`Q1 smoke passed (${checks.length}/${checks.length})`);
}

async function checkHealthDb() {
  const url = `${baseUrl}/health/db`;

  try {
    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        name: 'health/db',
        detail: `HTTP ${response.status} from ${url}`,
      };
    }

    if (body?.ok !== true) {
      return {
        ok: false,
        name: 'health/db',
        detail: `Unexpected payload: ${JSON.stringify(body)}`,
      };
    }

    return {
      ok: true,
      name: 'health/db',
      detail: `${url} -> database connected`,
    };
  } catch (error) {
    return {
      ok: false,
      name: 'health/db',
      detail: `${url} -> ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function checkLocalProdQuotaEnv() {
  const enabled = String(process.env.CHAT_RATE_LIMIT_ENABLED ?? '')
    .trim()
    .toLowerCase();
  const nodeEnv = String(process.env.NODE_ENV ?? '').trim();
  const enforceProdQuota = String(process.env.ENFORCE_PROD_CHAT_QUOTA ?? '')
    .trim()
    .toLowerCase();

  const productionLike =
    nodeEnv === 'production' ||
    enforceProdQuota === 'true' ||
    enforceProdQuota === '1' ||
    enforceProdQuota === 'yes';

  if (!productionLike) {
    return {
      ok: true,
      name: 'chat quota env',
      detail: 'Skipped — not a production-like runtime',
    };
  }

  const isEnabled = enabled === 'true' || enabled === '1' || enabled === 'yes';

  return {
    ok: isEnabled,
    name: 'chat quota env',
    detail: isEnabled
      ? 'CHAT_RATE_LIMIT_ENABLED=true'
      : 'CHAT_RATE_LIMIT_ENABLED must be true in production (H1)',
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

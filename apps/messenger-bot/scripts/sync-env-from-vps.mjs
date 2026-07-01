import fs from 'node:fs';

const skip = new Set([
  'DEPLOY_DIR',
  'DEPLOY_ENV_FILE',
  'DEPLOY_COMPOSE_FILE',
  'DEPLOY_UID',
  'DEPLOY_GID',
  'DOCKER_GID',
  'HOME',
  'DOPPLER_RUNTIME_SYNC_ENABLED',
  'DOPPLER_CONFIG',
  'DOPPLER_ENVIRONMENT',
  'DOPPLER_PROJECT',
  'DOPPLER_RUNTIME_TOKEN',
]);

const sourcePath = process.argv[2] ?? '.env.vps.tmp';
const targetPath = process.argv[3] ?? '.env';
const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
const out = [];

for (const line of lines) {
  if (!line.trim()) {
    continue;
  }

  const key = line.split('=')[0].trim();
  if (skip.has(key)) {
    continue;
  }

  if (key === 'PORT') {
    out.push('PORT=3001');
    continue;
  }

  const idx = line.indexOf('=');
  const k = line.slice(0, idx).trim();
  let v = line.slice(idx + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }

  out.push(`${k}=${v}`);
}

fs.writeFileSync(targetPath, `${out.join('\n')}\n`);
if (sourcePath.endsWith('.tmp')) {
  fs.unlinkSync(sourcePath);
}

console.log(
  `Synced ${out.length} vars to ${targetPath} (PORT=3001, deploy/doppler runtime keys omitted)`,
);

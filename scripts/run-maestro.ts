import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const defaultTarget = 'apps/expo/.maestro';
const target = process.argv[2] ?? defaultTarget;
const defaultWorkerBaseUrl = 'http://127.0.0.1:8787';

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).replace(/^export\s+/, '');
    const value = trimmed.slice(eqIndex + 1);
    process.env[key] ??= value;
  }
}

loadEnvFile(join(repoRoot, '.env.local'));
loadEnvFile(join(repoRoot, 'apps/expo/.env.local'));

process.env.PATH = `${process.env.HOME}/.maestro/bin:${process.env.PATH ?? ''}`;
process.env.MAESTRO_APP_ID ??= 'host.exp.exponent';
process.env.MAESTRO_OPEN_LINK ??=
  process.env.MAESTRO_APP_ID === 'host.exp.exponent' ? 'exp://10.0.2.2:8081' : 'strength://';
process.env.WORKER_BASE_URL = process.env.MAESTRO_WORKER_BASE_URL ?? defaultWorkerBaseUrl;

const required = ['MAESTRO_APP_ID', 'WORKER_BASE_URL', 'E2E_EMAIL', 'E2E_PASSWORD'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required Maestro env: ${missing.join(', ')}`);
  console.error('Set them in Infisical dev, repo-root .env.local, or export them before running.');
  process.exit(1);
}

async function assertWorkerReady() {
  const statusUrl = `${process.env.WORKER_BASE_URL}/api/health`;

  let response: Response;
  try {
    response = await fetch(statusUrl);
  } catch (error) {
    console.error(`Unable to reach worker at ${statusUrl}.`);
    console.error('Start it with `bun run dev`, then rerun the Maestro command.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => '');
  console.error(`Worker preflight failed: ${response.status} ${body}`);
  console.error(`Checked: ${statusUrl}`);
  console.error('This usually means the worker was not started with `bun run dev`.');
  process.exit(1);
}

const envArgs = [
  ['MAESTRO_APP_ID', process.env.MAESTRO_APP_ID],
  ['MAESTRO_OPEN_LINK', process.env.MAESTRO_OPEN_LINK],
  ['WORKER_BASE_URL', process.env.WORKER_BASE_URL],
  ['E2E_EMAIL', process.env.E2E_EMAIL],
  ['E2E_PASSWORD', process.env.E2E_PASSWORD],
]
  .filter((entry): entry is [string, string] => Boolean(entry[1]))
  .flatMap(([key, value]) => ['-e', `${key}=${value}`]);

await assertWorkerReady();

console.log(
  `Running Maestro against ${process.env.WORKER_BASE_URL} (${process.env.MAESTRO_APP_ID}, ${process.env.MAESTRO_OPEN_LINK})`,
);

const result = spawnSync('maestro', ['test', ...envArgs, target], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);

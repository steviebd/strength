#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

type TargetEnv = 'dev' | 'staging' | 'prod';
type D1Mode = 'local' | 'remote';

interface Args {
  env: TargetEnv;
  d1Mode: D1Mode;
}

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const WORKER_DIR = resolve(SCRIPT_DIR, '..');
const TEMPLATE_PATH = resolve(WORKER_DIR, 'wrangler.template.toml');
const OUTPUT_PATH = resolve(WORKER_DIR, 'wrangler.toml');
const LOCAL_DEV_DATABASE_ID = '00000000-0000-0000-0000-000000000000';

const INFISICAL_KEYS = [
  'CLOUDFLARE_D1_ID',
  'APP_ENV',
  'AI_GATEWAY_NAME',
  'AI_MODEL_NAME',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'WORKER_BASE_URL',
  'CF_AI_GATEWAY_TOKEN',
  'ENCRYPTION_MASTER_KEY',

  'WHOOP_CLIENT_ID',
  'WHOOP_CLIENT_SECRET',
  'WHOOP_SYNC_RATE_LIMIT_PER_HOUR',
  'WHOOP_WEBHOOK_SECRET',
] as const;

function parseArgs(): Args {
  const values = process.argv.slice(2);
  let env: TargetEnv = 'dev';
  let d1Mode: D1Mode = 'local';

  for (let index = 0; index < values.length; index++) {
    const value = values[index];

    if (value === '--env') {
      env = normalizeEnv(values[index + 1] ?? 'dev');
      index++;
      continue;
    }

    if (value === '--d1-mode') {
      d1Mode = normalizeD1Mode(values[index + 1] ?? 'local');
      index++;
      continue;
    }

    if (['dev', 'staging', 'prod', 'production'].includes(value)) {
      env = normalizeEnv(value);
      continue;
    }

    if (['local', 'remote'].includes(value)) {
      d1Mode = normalizeD1Mode(value);
    }
  }

  return { env, d1Mode };
}

function normalizeEnv(value: string): TargetEnv {
  if (value === 'production') return 'prod';
  if (value === 'dev' || value === 'staging' || value === 'prod') return value;
  console.error(`Unknown environment '${value}'. Use dev, staging, or prod.`);
  process.exit(1);
}

function normalizeD1Mode(value: string): D1Mode {
  if (value === 'local' || value === 'remote') return value;
  console.error(`Unknown D1 mode '${value}'. Use local or remote.`);
  process.exit(1);
}

function escapeTomlString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function quoteToml(value: string): string {
  return `"${escapeTomlString(value)}"`;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable '${name}'.`);
    process.exit(1);
  }
  return value;
}

function getInfisicalVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of INFISICAL_KEYS) {
    const value = process.env[key];
    if (value) vars[key] = value;
  }
  return vars;
}

function buildTemplateValues(args: Args): Record<string, string> {
  const vars = getInfisicalVars();
  const values: Record<string, string> = {
    D1_BLOCK: '',
    VARS_BLOCK: '',
    ENV_BLOCK: '',
  };

  if (args.env === 'dev') {
    const usingRemoteDev = args.d1Mode === 'remote';
    const dbName = usingRemoteDev ? 'strength-db-dev-remote' : 'strength-db-dev';
    const dbId = usingRemoteDev ? getRequiredEnv('CLOUDFLARE_D1_ID') : LOCAL_DEV_DATABASE_ID;

    values.D1_BLOCK = [
      '[[d1_databases]]',
      'binding = "DB"',
      `database_name = "${dbName}"`,
      `database_id = "${dbId}"`,
      `preview_database_id = "${dbName}"`,
      usingRemoteDev ? 'remote = true' : null,
      'migrations_dir = "../../packages/db/drizzle/migrations"',
    ]
      .filter(Boolean)
      .join('\n');

    values.VARS_BLOCK = renderVarsTable('[vars]', vars);
    return values;
  }

  const dbId = getRequiredEnv('CLOUDFLARE_D1_ID');
  const envName = args.env === 'staging' ? 'staging' : 'prod';
  const dbName = `strength-db-${envName}`;
  const workerName = `strength-worker-${envName}`;

  values.ENV_BLOCK = [
    `[env.${envName}]`,
    `name = "${workerName}"`,
    '',
    `[[env.${envName}.d1_databases]]`,
    'binding = "DB"',
    `database_name = "${dbName}"`,
    `database_id = "${dbId}"`,
    'migrations_dir = "../../packages/db/drizzle/migrations"',
    '',
    renderVarsTable(`[env.${envName}.vars]`, vars),
  ]
    .filter(Boolean)
    .join('\n');

  return values;
}

function renderVarsTable(header: string, vars: Record<string, string>): string {
  const entries = Object.entries(vars).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  const lines = entries.map(([key, value]) => `${key} = ${quoteToml(value)}`);
  return `${header}\n${lines.join('\n')}`;
}

function renderTemplate(args: Args): string {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const values = buildTemplateValues(args);

  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

function main(): void {
  const args = parseArgs();
  const rendered = renderTemplate(args);
  writeFileSync(OUTPUT_PATH, rendered);
  console.log(`Generated ${OUTPUT_PATH} for env='${args.env}' d1Mode='${args.d1Mode}'.`);
}

main();

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
  if (value === 'production') {
    return 'prod';
  }

  if (value === 'dev' || value === 'staging' || value === 'prod') {
    return value;
  }

  console.error(`Unknown environment '${value}'. Use dev, staging, or prod.`);
  process.exit(1);
}

function normalizeD1Mode(value: string): D1Mode {
  if (value === 'local' || value === 'remote') {
    return value;
  }

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

function getAppVars(): Record<string, string> {
  const keys = [
    'APP_ENV',
    'AI_GATEWAY_NAME',
    'AI_MODEL_NAME',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_TRUSTED_ORIGINS',
    'BETTER_AUTH_URL',
    'CF_AI_GATEWAY_TOKEN',
    'ENCRYPTION_MASTER_KEY',
    'EXPO_PUBLIC_API_URL',
    'WHOOP_CLIENT_ID',
    'WHOOP_CLIENT_SECRET',
    'WHOOP_SYNC_RATE_LIMIT_PER_HOUR',
    'WHOOP_WEBHOOK_SECRET',
  ] as const;

  const vars: Record<string, string> = {};

  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      vars[key] = value;
    }
  }

  return vars;
}

function renderVarsTable(header: string, vars: Record<string, string>): string {
  const entries = Object.entries(vars).sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return '';
  }

  const lines = entries.map(([key, value]) => `${key} = ${quoteToml(value)}`);
  return `${header}\n${lines.join('\n')}`;
}

function renderD1Block(
  databaseName: string,
  databaseId: string,
  options?: { previewDatabaseId?: string; remote?: boolean },
): string {
  const lines = [
    '[[d1_databases]]',
    'binding = "DB"',
    `database_name = ${quoteToml(databaseName)}`,
    `database_id = ${quoteToml(databaseId)}`,
  ];

  if (options?.previewDatabaseId) {
    lines.push(`preview_database_id = ${quoteToml(options.previewDatabaseId)}`);
  }

  if (options?.remote) {
    lines.push('remote = true');
  }

  lines.push('migrations_dir = "../../packages/db/drizzle/migrations"');

  return lines.join('\n');
}

function renderEnvD1Block(
  envName: 'staging' | 'prod',
  databaseName: string,
  databaseId: string,
): string {
  return [
    `[[env.${envName}.d1_databases]]`,
    'binding = "DB"',
    `database_name = ${quoteToml(databaseName)}`,
    `database_id = ${quoteToml(databaseId)}`,
    'migrations_dir = "../../packages/db/drizzle/migrations"',
  ].join('\n');
}

function renderEnvSection(
  envName: 'staging' | 'prod',
  workerName: string,
  databaseName: string,
  databaseId: string,
  vars: Record<string, string>,
): string {
  return [
    `[env.${envName}]`,
    `name = ${quoteToml(workerName)}`,
    '',
    renderEnvD1Block(envName, databaseName, databaseId),
    '',
    renderVarsTable(`[env.${envName}.vars]`, vars),
  ].join('\n');
}

function buildTemplateValues(args: Args): Record<string, string> {
  const vars = getAppVars();
  const values: Record<string, string> = {
    TOP_LEVEL_NAME: 'strength-worker',
    TOP_LEVEL_D1_BLOCK: '',
    TOP_LEVEL_VARS_BLOCK: '',
    STAGING_BLOCK: '',
    PRODUCTION_BLOCK: '',
  };

  if (args.env === 'dev') {
    const usingRemoteDev = args.d1Mode === 'remote';
    const databaseName = usingRemoteDev ? 'strength-db-dev-remote' : 'strength-db-dev';
    const databaseId = usingRemoteDev ? getRequiredEnv('CLOUDFLARE_D1_ID') : LOCAL_DEV_DATABASE_ID;

    values.TOP_LEVEL_D1_BLOCK = renderD1Block(databaseName, databaseId, {
      previewDatabaseId: databaseName,
      remote: usingRemoteDev,
    });
    values.TOP_LEVEL_VARS_BLOCK = renderVarsTable('[vars]', vars);
    return values;
  }

  if (args.env === 'staging') {
    values.STAGING_BLOCK = renderEnvSection(
      'staging',
      'strength-worker-staging',
      'strength-db-staging',
      getRequiredEnv('CLOUDFLARE_D1_ID'),
      vars,
    );
    return values;
  }

  values.PRODUCTION_BLOCK = renderEnvSection(
    'prod',
    'strength-worker-prod',
    'strength-db-prod',
    getRequiredEnv('CLOUDFLARE_D1_ID'),
    vars,
  );
  return values;
}

function renderTemplate(args: Args): string {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const values = buildTemplateValues(args);

  let rendered = template;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  rendered = rendered
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');

  return rendered;
}

function main(): void {
  const args = parseArgs();
  const rendered = renderTemplate(args);

  writeFileSync(OUTPUT_PATH, rendered);
  console.log(`Generated ${OUTPUT_PATH} for env='${args.env}' d1Mode='${args.d1Mode}'.`);
}

main();

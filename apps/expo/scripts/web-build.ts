import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const envFile = join(process.cwd(), '.env.local');

function writeEnvFile(secrets: Record<string, string>) {
  const content = Object.entries(secrets)
    .filter(([key]) => key.startsWith('EXPO_PUBLIC_'))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  writeFileSync(envFile, content);
  console.log(
    `Wrote ${Object.keys(secrets).filter((k) => k.startsWith('EXPO_PUBLIC_')).length} EXPO_PUBLIC_ vars to .env.local`,
  );
}

function runBuild() {
  const result = spawnSync('expo', ['export', '--platform', 'web'], {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function main() {
  if (isCI) {
    console.log('Detected CI environment - using injected env vars');
    const secrets: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('EXPO_PUBLIC_') && value) {
        secrets[key] = value;
      }
    }
    if (Object.keys(secrets).length === 0) {
      console.error('No EXPO_PUBLIC_* env vars found. Ensure Infisical secrets-action ran first.');
      process.exit(1);
    }
    writeEnvFile(secrets);
    runBuild();
    return;
  }

  console.log('Local build - fetching secrets from Infisical dev environment');
  const result = spawnSync('infisical', ['secrets', '--env', 'dev', '--output', 'dotenv'], {
    encoding: 'utf-8',
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    console.error('Failed to fetch secrets from Infisical dev');
    console.error('Ensure you are logged in: infisical login');
    process.exit(1);
  }

  const lines = result.stdout.split('\n').filter((line) => line.startsWith('EXPO_PUBLIC_'));
  const secrets: Record<string, string> = {};
  for (const line of lines) {
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex);
      const value = line.slice(eqIndex + 1);
      secrets[key] = value;
    }
  }
  if (Object.keys(secrets).length === 0) {
    console.error('No EXPO_PUBLIC_* secrets found in Infisical dev');
    process.exit(1);
  }
  writeEnvFile(secrets);
  console.log('Wrote secrets to .env.local');
  runBuild();
}

main();

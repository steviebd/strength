import { readFileSync, writeFileSync } from 'node:fs';
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

function injectNoscriptFallback() {
  const indexPath = join(process.cwd(), 'dist', 'index.html');
  let html = readFileSync(indexPath, 'utf-8');

  const noscriptContent = `<noscript>
  <style>
    body { overflow: auto; background: #0a0a0a; color: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; }
    .ns-container { max-width: 640px; margin: 0 auto; padding: 48px 24px; }
    .ns-brand { font-size: 48px; font-weight: 800; letter-spacing: -1px; text-align: center; margin-bottom: 16px; }
    .ns-tagline { font-size: 17px; line-height: 26px; color: #a1a1aa; text-align: center; max-width: 480px; margin: 0 auto 32px; }
    .ns-section-title { font-size: 17px; font-weight: 600; text-align: center; margin-bottom: 16px; }
    .ns-card { background: #18181b; border: 1px solid #3f3f46; border-radius: 16px; padding: 20px; margin-bottom: 12px; }
    .ns-card-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
    .ns-card-desc { font-size: 13px; line-height: 20px; color: #a1a1aa; }
    .ns-footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #27272a; }
    .ns-footer a { color: #a1a1aa; text-decoration: underline; margin: 0 8px; }
    .ns-copy { font-size: 13px; color: #71717a; margin-top: 8px; }
  </style>
  <div class="ns-container">
    <div class="ns-brand">strength</div>
    <div class="ns-tagline">Track workouts, build programs, monitor nutrition, and sync with WHOOP — all in one place.</div>
    <div class="ns-section-title">What you can do</div>
    <div class="ns-card">
      <div class="ns-card-title">Workout Tracking</div>
      <div class="ns-card-desc">Log exercises, sets, reps, and RPE ratings with a focused, distraction-free interface.</div>
    </div>
    <div class="ns-card">
      <div class="ns-card-title">Program Builder</div>
      <div class="ns-card-desc">Create structured training programs and follow progressive cycles to reach your goals.</div>
    </div>
    <div class="ns-card">
      <div class="ns-card-title">Nutrition &amp; AI</div>
      <div class="ns-card-desc">Log meals, track macros, and get AI-powered nutrition insights and meal suggestions.</div>
    </div>
    <div class="ns-card">
      <div class="ns-card-title">WHOOP Integration</div>
      <div class="ns-card-desc">Sync recovery, sleep, and strain data from your WHOOP strap for a complete picture.</div>
    </div>
    <div class="ns-footer">
      <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>
      <div class="ns-copy">© ${new Date().getFullYear()} Strength Pty Ltd · stevenbduong@gmail.com</div>
    </div>
  </div>
</noscript>`;

  html = html.replace(
    /<noscript>\s*You need to enable JavaScript to run this app\.\s*<\/noscript>/,
    noscriptContent,
  );

  writeFileSync(indexPath, html);
  console.log('Injected noscript fallback into dist/index.html');
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
    injectNoscriptFallback();
    return;
  }

  const result = spawnSync('bun', ['run', 'sync-env:dev'], {
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(1);
  }

  runBuild();
  injectNoscriptFallback();
}

main();

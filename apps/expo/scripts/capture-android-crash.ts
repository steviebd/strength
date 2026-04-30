import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const APP_ID = 'com.strength.app';
const BUILDS_DIR = join(process.cwd(), 'builds');

type Options = {
  apkPath: string | null;
  install: boolean;
  seconds: number;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    apkPath: null,
    install: true,
    seconds: 20,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-install') {
      options.install = false;
    } else if (arg === '--apk') {
      options.apkPath = args[++i] ? resolve(args[i]) : null;
    } else if (arg === '--seconds') {
      const seconds = Number(args[++i]);
      if (Number.isFinite(seconds) && seconds > 0) {
        options.seconds = seconds;
      }
    }
  }

  return options;
}

function runAdb(
  args: string[],
  options: { allowFailure?: boolean; stdio?: 'pipe' | 'inherit' } = {},
) {
  const result = spawnSync('adb', args, {
    encoding: 'utf-8',
    stdio: options.stdio ?? 'pipe',
  });

  if (!options.allowFailure && result.status !== 0) {
    const message =
      result.stderr?.trim() || result.stdout?.trim() || `adb ${args.join(' ')} failed`;
    throw new Error(message);
  }

  return result;
}

function getConnectedDevice() {
  const result = runAdb(['devices']);
  const devices = result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device');

  return devices[0]?.[0] ?? null;
}

function getLatestApk() {
  if (!existsSync(BUILDS_DIR)) {
    return null;
  }

  const apks = readdirSync(BUILDS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.apk'))
    .map((entry) => join(BUILDS_DIR, entry.name))
    .sort((a, b) => {
      const aNumber = Number.parseInt(basename(a, '.apk'), 10);
      const bNumber = Number.parseInt(basename(b, '.apk'), 10);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
        return bNumber - aNumber;
      }
      return b.localeCompare(a);
    });

  return apks[0] ?? null;
}

function sleep(seconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

const options = parseArgs();
const device = getConnectedDevice();

if (!device) {
  console.error(
    'No authorized Android device found. Connect one and confirm `adb devices` shows state `device`.',
  );
  process.exit(1);
}

const apkPath = options.apkPath ?? getLatestApk();

if (options.install) {
  if (!apkPath) {
    console.error(
      'No APK found. Run `bun run build:android:staging` first or pass `--apk <path>`.',
    );
    process.exit(1);
  }

  console.log(`Installing ${apkPath} on ${device}...`);
  runAdb(['install', '-r', apkPath], { stdio: 'inherit' });
}

console.log('Clearing logcat and launching app...');
runAdb(['shell', 'am', 'force-stop', APP_ID], { allowFailure: true });
runAdb(['logcat', '-c'], { allowFailure: true });
runAdb(['shell', 'monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1'], {
  allowFailure: true,
});

sleep(options.seconds);

const logResult = runAdb(
  ['logcat', '-b', 'main', '-b', 'system', '-b', 'crash', '-d', '-v', 'time'],
  { allowFailure: true },
);
const log = `${logResult.stdout ?? ''}${logResult.stderr ?? ''}`;
mkdirSync(BUILDS_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = join(BUILDS_DIR, `android-crash-${timestamp}.log`);
writeFileSync(logPath, log);

const interestingLine =
  /AndroidRuntime|ReactNativeJS|ReactNative|ExpoModulesCore|FATAL EXCEPTION|Fatal signal|com\.strength\.app|Hermes|SoLoader|System\.err|Exception|Error/i;
const focused = log
  .split('\n')
  .filter((line) => interestingLine.test(line))
  .slice(-220)
  .join('\n');

console.log(`Full log saved: ${logPath}`);
console.log('');
console.log('Focused crash excerpt:');
console.log(focused || '(No focused crash lines matched. Inspect the full log.)');

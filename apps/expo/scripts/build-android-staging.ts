import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const BUILDS_DIR = join(process.cwd(), 'builds');
const SERVER_PORT = Number(process.env.BUILDS_SERVER_PORT ?? '8080');
function getJavaHome(): string {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }
  const result = spawnSync('/usr/libexec/java_home', ['-v', '17'], {
    encoding: 'utf-8',
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  throw new Error('JAVA_HOME not set and Java 17 not found via /usr/libexec/java_home');
}

const BUILD_ENV = {
  ...process.env,
  EAS_SKIP_AUTO_FINGERPRINT: process.env.EAS_SKIP_AUTO_FINGERPRINT ?? '1',
  NODE_ENV: process.env.NODE_ENV ?? 'production',
  JAVA_HOME: getJavaHome(),
};

function getNextBuildNumber(): number {
  let max = 0;
  if (existsSync(BUILDS_DIR)) {
    for (const file of readdirSync(BUILDS_DIR)) {
      if (file.endsWith('.apk')) {
        const num = parseInt(file.replace('.apk', ''), 10);
        if (!isNaN(num) && num > max) max = num;
      }
    }
  }
  return max + 1;
}

function getLanIp() {
  const interfaces = networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }

  return 'localhost';
}

function runInfisicalCommand(args: string[]) {
  return spawnSync(
    'infisical',
    ['run', '--env=staging', '--project-config-dir', '../..', '--', ...args],
    {
      cwd: process.cwd(),
      env: BUILD_ENV,
      encoding: 'utf-8',
    },
  );
}

const envCheck = runInfisicalCommand([
  'sh',
  '-c',
  'test -n "$EXPO_PUBLIC_WORKER_BASE_URL" && printf "%s" "$EXPO_PUBLIC_WORKER_BASE_URL"',
]);

if (envCheck.status !== 0 || !envCheck.stdout.trim()) {
  console.error('Missing EXPO_PUBLIC_WORKER_BASE_URL in Infisical staging.');
  console.error('Set it to the staging Worker URL before building the APK.');
  process.exit(1);
}

mkdirSync(BUILDS_DIR, { recursive: true });

const buildNumber = getNextBuildNumber();
const destPath = join(BUILDS_DIR, `${buildNumber}.apk`);
const workerUrl = envCheck.stdout.trim();

console.log(`Staging Worker URL: ${workerUrl}`);
console.log(`Starting staging Android build ${buildNumber}...`);

const eas = spawn(
  'infisical',
  [
    'run',
    '--env=staging',
    '--project-config-dir',
    '../..',
    '--',
    'eas',
    'build',
    '--local',
    '--platform',
    'android',
    '--profile',
    'staging',
  ],
  {
    cwd: process.cwd(),
    env: BUILD_ENV,
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

let output = '';

eas.stdout.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
});

eas.stderr.on('data', (chunk: Buffer) => {
  const text = chunk.toString();
  output += text;
  process.stderr.write(text);
});

eas.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  const apkPaths = output.match(/(?:\/|[A-Za-z]:\\)[^\s'"]+\.apk/g);
  const apkPath = apkPaths?.at(-1);

  if (!apkPath) {
    console.error('Could not find APK path in EAS output.');
    process.exit(1);
  }

  console.log(`Copying ${apkPath} -> ${destPath}`);
  cpSync(apkPath, destPath);

  const lanIp = getLanIp();
  const installUrl = `http://${lanIp}:${SERVER_PORT}/${buildNumber}.apk`;

  console.log('');
  console.log(`Build saved: ${destPath}`);
  console.log(`Install URL: ${installUrl}`);
  console.log(`Serving builds directory on port ${SERVER_PORT}. Press Ctrl+C to stop.`);

  const server = spawn('python3', ['-m', 'http.server', String(SERVER_PORT)], {
    cwd: BUILDS_DIR,
    stdio: 'inherit',
  });

  server.on('exit', (serverCode) => {
    process.exit(serverCode ?? 0);
  });
});

import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const BUILDS_DIR = join(process.cwd(), 'builds');
const ENV_LOCAL_PATH = join(process.cwd(), '.env.local');
const PREFERRED_SERVER_PORT = Number(process.env.BUILDS_SERVER_PORT ?? '8080');
const SKIP_SERVER = process.env.BUILDS_SKIP_SERVER === '1';

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

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer()
      .once('error', () => {
        resolve(false);
      })
      .once('listening', () => {
        server.close(() => {
          resolve(true);
        });
      })
      .listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(startPort: number) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available build server port found from ${startPort} to ${startPort + 19}`);
}

function syncStagingEnv() {
  const result = spawnSync('bun', ['run', 'sync-env:staging'], {
    cwd: process.cwd(),
    env: BUILD_ENV,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readEnvLocal() {
  const env: Record<string, string> = {};
  const content = readFileSync(ENV_LOCAL_PATH, 'utf-8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex);
    const value = trimmed.slice(eqIndex + 1);
    if (key.startsWith('EXPO_PUBLIC_')) {
      env[key] = value;
    }
  }

  return env;
}

syncStagingEnv();
const expoPublicEnv = readEnvLocal();
const workerUrl = expoPublicEnv.EXPO_PUBLIC_WORKER_BASE_URL;

mkdirSync(BUILDS_DIR, { recursive: true });

const buildNumber = getNextBuildNumber();
const destPath = join(BUILDS_DIR, `${buildNumber}.apk`);
const easEnv = {
  ...BUILD_ENV,
  ...expoPublicEnv,
};

console.log(`Staging Worker URL: ${workerUrl}`);
console.log(`Expo app scheme: ${expoPublicEnv.EXPO_PUBLIC_APP_SCHEME}`);
console.log(`Starting staging Android build ${buildNumber}...`);

const eas = spawn('eas', ['build', '--local', '--platform', 'android', '--profile', 'staging'], {
  cwd: process.cwd(),
  env: easEnv,
  stdio: ['inherit', 'pipe', 'pipe'],
});

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

eas.on('exit', async (code) => {
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

  console.log('');
  console.log(`Build saved: ${destPath}`);

  if (SKIP_SERVER) {
    process.exit(0);
  }

  const lanIp = getLanIp();
  const serverPort = await findAvailablePort(PREFERRED_SERVER_PORT);
  const installUrl = `http://${lanIp}:${serverPort}/${buildNumber}.apk`;

  console.log(`Install URL: ${installUrl}`);
  console.log(`Serving builds directory on port ${serverPort}. Press Ctrl+C to stop.`);

  const server = spawn('python3', ['-m', 'http.server', String(serverPort)], {
    cwd: BUILDS_DIR,
    stdio: 'inherit',
  });

  server.on('exit', (serverCode) => {
    process.exit(serverCode ?? 0);
  });
});

process.once('SIGINT', () => {
  eas.kill('SIGINT');
  process.exit(130);
});

process.once('SIGTERM', () => {
  eas.kill('SIGTERM');
  process.exit(143);
});

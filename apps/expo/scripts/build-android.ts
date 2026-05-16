import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

const BUILDS_DIR = join(process.cwd(), 'builds');
const ENV_LOCAL_PATH = join(process.cwd(), '.env.local');
const PREFERRED_SERVER_PORT = Number(process.env.BUILDS_SERVER_PORT ?? '8080');
const SKIP_SERVER = process.env.BUILDS_SKIP_SERVER === '1';

const ALLOWED_ENVS = ['staging', 'prod'] as const;
type BuildEnv = (typeof ALLOWED_ENVS)[number];

const ENV_PROFILE_MAP: Record<BuildEnv, string> = {
  staging: 'staging',
  prod: 'production-apk',
};

function getJavaHome(): string {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }

  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/libexec/java_home', ['-v', '17'], {
      encoding: 'utf-8',
    });
    if (result.status === 0 && result.stdout.trim()) {
      return result.stdout.trim();
    }
  }

  const linuxPaths = [
    '/usr/lib/jvm/java-17-openjdk',
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/default-java',
  ];
  for (const path of linuxPaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  const whichResult = spawnSync('which', ['java'], { encoding: 'utf-8' });
  if (whichResult.status === 0) {
    const javaPath = whichResult.stdout.trim();
    const versionResult = spawnSync(javaPath, ['-version'], {
      encoding: 'utf-8',
    });
    if (versionResult.status === 0 && versionResult.stderr.includes('17')) {
      const readlinkResult = spawnSync('readlink', ['-f', javaPath], {
        encoding: 'utf-8',
      });
      if (readlinkResult.status === 0) {
        const realPath = readlinkResult.stdout.trim();
        const match = realPath.match(/^(.+)\/bin\/java$/);
        if (match) {
          return match[1];
        }
      }
    }
  }

  throw new Error(
    'JAVA_HOME not set and Java 17 home could not be determined automatically. ' +
      'Please set JAVA_HOME to your Java 17 installation directory (e.g., /usr/lib/jvm/java-17-openjdk).',
  );
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

function syncEnv(env: BuildEnv) {
  const result = spawnSync('pnpm', ['run', `sync-env:${env}`], {
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

function parseArgs(): BuildEnv {
  const arg = process.argv[2];
  if (!arg || !ALLOWED_ENVS.includes(arg as BuildEnv)) {
    console.error(`Usage: pnpm exec tsx scripts/build-android.ts <${ALLOWED_ENVS.join('|')}>`);
    process.exit(1);
  }
  return arg as BuildEnv;
}

const env = parseArgs();
const profile = ENV_PROFILE_MAP[env];
const displayEnv = env === 'prod' ? 'production' : env;

syncEnv(env);
const expoPublicEnv = readEnvLocal();
const workerUrl = expoPublicEnv.EXPO_PUBLIC_WORKER_BASE_URL;

mkdirSync(BUILDS_DIR, { recursive: true });

const buildNumber = getNextBuildNumber();
const destPath = join(BUILDS_DIR, `${buildNumber}.apk`);
const easEnv = {
  ...BUILD_ENV,
  ...expoPublicEnv,
};

console.log(`${displayEnv.charAt(0).toUpperCase() + displayEnv.slice(1)} Worker URL: ${workerUrl}`);
console.log(`Expo app scheme: ${expoPublicEnv.EXPO_PUBLIC_APP_SCHEME}`);
console.log(`Starting ${displayEnv} Android build ${buildNumber}...`);

const eas = spawn('eas', ['build', '--local', '--platform', 'android', '--profile', profile], {
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
  const workdirMatch = output.match(/\[SETUP_WORKINGDIR\]\s+Preparing workingdir\s+(\S+)/);
  const workdir = workdirMatch?.[1] ?? process.env.EAS_LOCAL_BUILD_WORKINGDIR;

  if (code !== 0) {
    if (workdir) {
      console.log(`Cleaning up failed build workingdir: ${workdir}`);
      rmSync(workdir, { recursive: true, force: true });
    }
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
  rmSync(apkPath);

  if (workdir && existsSync(workdir)) {
    console.log(`Cleaning up build workingdir: ${workdir}`);
    rmSync(workdir, { recursive: true, force: true });
  }

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

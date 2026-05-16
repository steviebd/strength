import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { delimiter } from 'node:path';
import { join } from 'node:path';

const repoRoot = process.cwd();
const defaultTarget = 'apps/expo/.maestro';
const target = process.argv[2] ?? defaultTarget;
const defaultWorkerBaseUrl = 'http://127.0.0.1:8787';

function resolveTargets(path: string) {
  if (!existsSync(path)) {
    console.error(`Maestro target not found: ${path}`);
    process.exit(1);
  }

  if (!statSync(path).isDirectory()) {
    return [path];
  }

  const flows = readdirSync(path)
    .filter((file) => !file.startsWith('_') && /\.(ya?ml)$/i.test(file))
    .sort()
    .map((file) => join(path, file));

  if (flows.length === 0) {
    console.error(`No runnable Maestro flows found in ${path}`);
    process.exit(1);
  }

  return flows;
}

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

function resolveCommand(command: string) {
  if (command.includes('/')) {
    return existsSync(command) ? command : null;
  }

  for (const pathEntry of (process.env.PATH ?? '').split(delimiter)) {
    if (!pathEntry) continue;
    const candidate = join(pathEntry, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveMaestroCommand() {
  const configured = process.env.MAESTRO_BINARY;
  const command = configured?.trim() || 'maestro';
  const resolved = resolveCommand(command);

  if (resolved) {
    return resolved;
  }

  console.error(`Maestro CLI was not found: ${command}`);
  console.error('Checked PATH entries:');
  for (const pathEntry of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    console.error(`- ${pathEntry}`);
  }
  console.error('');
  console.error('Install the CLI with: curl -Ls "https://get.maestro.mobile.dev" | bash');
  console.error('Then restart the terminal, or set MAESTRO_BINARY=/absolute/path/to/maestro.');
  console.error('Maestro Studio by itself is not enough for `pnpm run e2e:maestro`.');
  process.exit(1);
}

function getConnectedAndroidDevice() {
  const result = spawnSync('adb', ['devices'], {
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    console.error('Unable to list Android devices with adb.');
    console.error(result.stderr?.trim() || result.error?.message || 'Unknown error');
    process.exit(1);
  }

  const connectedDevices = result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'));

  const requestedDevice = process.env.MAESTRO_DEVICE_ID;
  if (
    requestedDevice &&
    !connectedDevices.some((line) => line.startsWith(`${requestedDevice}\t`))
  ) {
    console.error(`Requested Android device is not connected: ${requestedDevice}`);
    console.error(`Connected devices: ${connectedDevices.join(', ') || '(none)'}`);
    process.exit(1);
  }

  if (connectedDevices.length === 0) {
    console.error('No Android emulator/device is connected.');
    console.error('Start an emulator or connect a physical Android device, then rerun.');
    console.error('Available Android AVDs can be listed with: emulator -list-avds');
    console.error('For this machine, try: emulator -avd Medium_Phone_API_36.0');
    process.exit(1);
  }

  return requestedDevice ?? connectedDevices[0].split('\t')[0];
}

function prepareExpoGo(deviceId: string) {
  const adb = (...args: string[]) =>
    spawnSync('adb', ['-s', deviceId, ...args], {
      env: process.env,
      stdio: 'ignore',
    });

  adb('shell', 'pm', 'clear', 'host.exp.exponent');
  adb('shell', 'monkey', '-p', 'host.exp.exponent', '1');
  spawnSync('sleep', ['3']);
  if (process.env.MAESTRO_OPEN_LINK) {
    adb(
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      process.env.MAESTRO_OPEN_LINK,
    );
    spawnSync('sleep', ['25']);
  }
  for (let i = 0; i < 3; i += 1) {
    adb('shell', 'input', 'tap', '540', '2150');
    spawnSync('sleep', ['1']);
  }
  for (const [x, y] of [
    ['970', '1080'],
    ['970', '1740'],
  ]) {
    adb('shell', 'input', 'tap', x, y);
    spawnSync('sleep', ['1']);
  }
  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
}

function assertDeviceAvailable(maestroCommand: string) {
  if (process.env.MAESTRO_APP_ID === 'host.exp.exponent') {
    const deviceId = getConnectedAndroidDevice();
    prepareExpoGo(deviceId);
    return;
  }

  const result = spawnSync(maestroCommand, ['list-devices'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.error || result.status !== 0) {
    console.error('Unable to list Maestro devices.');
    console.error(result.stderr?.trim() || result.error?.message || 'Unknown error');
    process.exit(1);
  }
}

loadEnvFile(join(repoRoot, '.env.local'));
loadEnvFile(join(repoRoot, 'apps/expo/.env.local'));

process.env.PATH = `${process.env.HOME}/.maestro/bin:${process.env.PATH ?? ''}`;
process.env.ANDROID_HOME ??= `${process.env.HOME}/Library/Android/sdk`;
process.env.ANDROID_SDK_ROOT ??= process.env.ANDROID_HOME;
process.env.MAESTRO_APP_ID ??= 'host.exp.exponent';
process.env.MAESTRO_OPEN_LINK ??=
  process.env.MAESTRO_APP_ID === 'host.exp.exponent' ? 'exp://10.0.2.2:8081' : 'strength://';
process.env.WORKER_BASE_URL = process.env.MAESTRO_WORKER_BASE_URL ?? defaultWorkerBaseUrl;
process.env.MAESTRO_RUN_ID ??= new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, '')
  .slice(0, 14);

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
    console.error('Start it with `pnpm run dev`, then rerun the Maestro command.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (response.ok) {
    return;
  }

  const body = await response.text().catch(() => '');
  console.error(`Worker preflight failed: ${response.status} ${body}`);
  console.error(`Checked: ${statusUrl}`);
  console.error('This usually means the worker was not started with `pnpm run dev`.');
  process.exit(1);
}

async function main() {
  await assertWorkerReady();
  const maestroCommand = resolveMaestroCommand();
  assertDeviceAvailable(maestroCommand);

  const targets = resolveTargets(target);

  console.log(
    `Running Maestro against ${process.env.WORKER_BASE_URL} (${process.env.MAESTRO_APP_ID}, ${process.env.MAESTRO_OPEN_LINK})`,
  );
  console.log(`Flows: ${targets.join(', ')}`);

  const deviceArgs = process.env.MAESTRO_DEVICE_ID
    ? ['--device', process.env.MAESTRO_DEVICE_ID]
    : [];
  const result = spawnSync(maestroCommand, [...deviceArgs, 'test', ...targets], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

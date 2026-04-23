import { detectLANIP } from '../src/utils/detect-ip';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DEV_VARS_PATH = resolve(__dirname, '../.dev.vars');
const PORT = 8787;

const ip = detectLANIP();

if (!ip) {
  console.error('❌ Could not detect LAN IP. Make sure you are connected to a network.');
  process.exit(1);
}

const workerUrl = `http://${ip}:${PORT}`;

console.log(`🔍 Detected LAN IP: ${ip}`);
console.log(`📍 Worker URL: ${workerUrl}`);

const marker = '\n# AUTO_DETECTED_LAN_IP\n';
const value = `WORKER_BASE_URL=${workerUrl}\n`;

if (existsSync(DEV_VARS_PATH)) {
  let content = readFileSync(DEV_VARS_PATH, 'utf-8');

  if (content.includes('WORKER_BASE_URL=')) {
    content = content.replace(/^WORKER_BASE_URL=.*$/m, `WORKER_BASE_URL=${workerUrl}`);
    writeFileSync(DEV_VARS_PATH, content);
    console.log(`✅ Updated WORKER_BASE_URL in existing .dev.vars`);
  } else {
    appendFileSync(DEV_VARS_PATH, `${marker}${value}`);
    console.log(`✅ Appended WORKER_BASE_URL to .dev.vars`);
  }
} else {
  writeFileSync(DEV_VARS_PATH, `${marker}${value}`);
  console.log(`✅ Created .dev.vars with WORKER_BASE_URL`);
}

console.log('\n🚀 Starting wrangler dev...');
console.log('   Android device should connect to:', workerUrl);
console.log('   (Expo app will automatically use this for API calls)\n');

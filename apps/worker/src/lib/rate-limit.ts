const store = new Map<string, { count: number; windowStart: number }>();
let checkCount = 0;
const CLEANUP_INTERVAL = 100;
const HOUR_MS = 60 * 60 * 1000;

function cleanupStale(): void {
  const cutoff = Date.now() - HOUR_MS;
  for (const [key, entry] of store) {
    if (entry.windowStart < cutoff) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export function getRateLimitPerHour(env: { RATE_LIMIT_REQUEST_PER_HOUR?: string }): number {
  const parsed = Number(env.RATE_LIMIT_REQUEST_PER_HOUR);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 1000;
}

export function shouldSkipRateLimit(env: { APP_ENV?: string; SKIP_RATE_LIMIT?: string }): boolean {
  return env.APP_ENV === 'development' && env.SKIP_RATE_LIMIT === 'true';
}

export function getRateLimitByEndpoint(path: string): number {
  if (path.startsWith('/api/auth/sign-in/') || path.startsWith('/api/auth/sign-up/')) {
    return 20;
  }
  if (path === '/api/auth/request-password-reset' || path === '/api/auth/check-email-provider') {
    return 5;
  }
  if (path === '/api/nutrition/chat') {
    return 60;
  }
  return 500;
}

const cheapReadPrefixes = [
  '/api/home/summary',
  '/api/programs/active',
  '/api/programs/latest-1rms',
  '/api/nutrition/entries',
  '/api/nutrition/daily-summary',
  '/api/nutrition/body-stats',
  '/api/nutrition/training-context',
  '/api/nutrition/chat/jobs/',
  '/api/nutrition/chat/history',
  '/api/exercises',
  '/api/templates',
  '/api/me',
  '/api/profile/preferences',
];

const sensitivePrefixes = ['/api/auth/', '/api/whoop/'];

export function getRateLimitGranularity(
  method: string,
  path: string,
): 'endpoint' | 'read' | 'skip' {
  if (method === 'GET') {
    for (const prefix of cheapReadPrefixes) {
      if (path.startsWith(prefix)) {
        return 'skip';
      }
    }
  }

  for (const prefix of sensitivePrefixes) {
    if (path.startsWith(prefix)) {
      return 'endpoint';
    }
  }

  if (method === 'POST' && path === '/api/nutrition/chat') {
    return 'endpoint';
  }

  if (
    (method === 'POST' || method === 'PUT' || method === 'DELETE') &&
    path.startsWith('/api/workouts/')
  ) {
    return 'endpoint';
  }

  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    return 'endpoint';
  }

  return 'read';
}

export async function checkRateLimit(
  key: string,
  endpoint: string,
  limitPerHour: number,
): Promise<RateLimitResult> {
  const mapKey = `${key}:${endpoint}`;
  const now = Date.now();
  const currentWindow = Math.floor(now / HOUR_MS) * HOUR_MS;

  const entry = store.get(mapKey);

  if (!entry || entry.windowStart < currentWindow) {
    store.set(mapKey, { count: 1, windowStart: currentWindow });
    return { allowed: true, remaining: limitPerHour - 1 };
  }

  entry.count = Math.min(entry.count + 1, limitPerHour + 1);

  if (entry.count <= limitPerHour) {
    return { allowed: true, remaining: limitPerHour - entry.count };
  }

  const retryAfter = Math.ceil((entry.windowStart + HOUR_MS - now) / 1000);

  checkCount++;
  if (checkCount >= CLEANUP_INTERVAL) {
    checkCount = 0;
    cleanupStale();
  }

  return { allowed: false, remaining: 0, retryAfter: retryAfter > 0 ? retryAfter : 0 };
}

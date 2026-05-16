export interface RateLimitResult {
  allowed: boolean;
}

export function shouldSkipRateLimit(env: { APP_ENV?: string; SKIP_RATE_LIMIT?: string }): boolean {
  return env.APP_ENV === 'development' && env.SKIP_RATE_LIMIT === 'true';
}

function pickLimiter(
  env: {
    RATE_LIMITER_AUTH: RateLimit;
    RATE_LIMITER_GENERAL: RateLimit;
    RATE_LIMITER_CHAT: RateLimit;
    RATE_LIMITER_WHOOP: RateLimit;
  },
  path: string,
): RateLimit {
  if (path.startsWith('/api/auth/')) return env.RATE_LIMITER_AUTH;
  if (path === '/api/nutrition/chat') return env.RATE_LIMITER_CHAT;
  if (path.startsWith('/api/whoop/') || path.startsWith('/api/webhooks/whoop'))
    return env.RATE_LIMITER_WHOOP;
  return env.RATE_LIMITER_GENERAL;
}

export async function checkRateLimit(
  env: {
    RATE_LIMITER_AUTH: RateLimit;
    RATE_LIMITER_GENERAL: RateLimit;
    RATE_LIMITER_CHAT: RateLimit;
    RATE_LIMITER_WHOOP: RateLimit;
  },
  key: string,
  path: string,
): Promise<RateLimitResult> {
  const limiter = pickLimiter(env, path);
  const result = await limiter.limit({ key });
  return { allowed: result.success };
}

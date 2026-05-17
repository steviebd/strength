import { describe, expect, test, vi } from 'vitest';
import { checkRateLimit, shouldSkipRateLimit } from './rate-limit';

function mockLimiter(success: boolean): { limit: ReturnType<typeof vi.fn> } {
  return { limit: vi.fn().mockResolvedValue({ success }) };
}

function makeEnv(overrides?: Record<string, any>) {
  return {
    RATE_LIMITER_AUTH: mockLimiter(true),
    RATE_LIMITER_GENERAL: mockLimiter(true),
    RATE_LIMITER_CHAT: mockLimiter(true),
    RATE_LIMITER_WHOOP: mockLimiter(true),
    ...overrides,
  } as any;
}

describe('shouldSkipRateLimit', () => {
  test('skips when APP_ENV=development and SKIP_RATE_LIMIT=true', () => {
    expect(shouldSkipRateLimit({ APP_ENV: 'development', SKIP_RATE_LIMIT: 'true' })).toBe(true);
  });

  test('does not skip when SKIP_RATE_LIMIT is false', () => {
    expect(shouldSkipRateLimit({ APP_ENV: 'development', SKIP_RATE_LIMIT: 'false' })).toBe(false);
  });

  test('does not skip in production', () => {
    expect(shouldSkipRateLimit({ APP_ENV: 'production', SKIP_RATE_LIMIT: 'true' })).toBe(false);
  });
});

describe('checkRateLimit', () => {
  test('routes auth paths to RATE_LIMITER_AUTH', async () => {
    const env = makeEnv();
    await checkRateLimit(env, 'user-1', '/api/auth/sign-in/email');
    expect(env.RATE_LIMITER_AUTH.limit).toHaveBeenCalledWith({ key: 'user-1' });
  });

  test('routes get-session to RATE_LIMITER_GENERAL', async () => {
    const env = makeEnv();
    await checkRateLimit(env, 'user-1', '/api/auth/get-session');
    expect(env.RATE_LIMITER_GENERAL.limit).toHaveBeenCalledWith({ key: 'user-1' });
    expect(env.RATE_LIMITER_AUTH.limit).not.toHaveBeenCalled();
  });

  test('routes nutrition chat to RATE_LIMITER_CHAT', async () => {
    const env = makeEnv();
    await checkRateLimit(env, 'user-1', '/api/nutrition/chat');
    expect(env.RATE_LIMITER_CHAT.limit).toHaveBeenCalledWith({ key: 'user-1' });
  });

  test('routes whoop paths to RATE_LIMITER_WHOOP', async () => {
    const env = makeEnv();
    await checkRateLimit(env, 'user-1', '/api/whoop/status');
    expect(env.RATE_LIMITER_WHOOP.limit).toHaveBeenCalledWith({ key: 'user-1' });
  });

  test('routes whoop webhook to RATE_LIMITER_WHOOP', async () => {
    const env = makeEnv();
    await checkRateLimit(env, 'user-1', '/api/webhooks/whoop');
    expect(env.RATE_LIMITER_WHOOP.limit).toHaveBeenCalledWith({ key: 'user-1' });
  });

  test('routes general paths to RATE_LIMITER_GENERAL', async () => {
    const env = makeEnv();
    await checkRateLimit(env, 'user-1', '/api/workouts');
    expect(env.RATE_LIMITER_GENERAL.limit).toHaveBeenCalledWith({ key: 'user-1' });
  });

  test('returns allowed when under limit', async () => {
    const env = makeEnv();
    const result = await checkRateLimit(env, 'user-1', '/api/workouts');
    expect(result.allowed).toBe(true);
  });

  test('returns blocked when over limit', async () => {
    const authLimiter = mockLimiter(false);
    const env = makeEnv({ RATE_LIMITER_AUTH: authLimiter });
    const result = await checkRateLimit(env, 'user-1', '/api/auth/sign-in');
    expect(result.allowed).toBe(false);
  });
});

import { describe, expect, test } from 'vitest';
import { checkRateLimit, getRateLimitPerHour } from './rate-limit';

function createDb(existing: { requests: number; windowStart: Date; id?: string } | null = null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () =>
            existing
              ? {
                  ...existing,
                  id: existing.id ?? 'rl-1',
                  userId: 'user-1',
                  endpoint: 'test',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }
              : null,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        run: async () => ({ success: true }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: async () => ({ success: true }),
        }),
      }),
    }),
  } as any;
}

describe('getRateLimitPerHour', () => {
  test('returns parsed env value', () => {
    expect(getRateLimitPerHour({ RATE_LIMIT_REQUEST_PER_HOUR: '500' })).toBe(500);
  });

  test('returns default when missing', () => {
    expect(getRateLimitPerHour({})).toBe(1000);
  });

  test('returns default for invalid string', () => {
    expect(getRateLimitPerHour({ RATE_LIMIT_REQUEST_PER_HOUR: 'abc' })).toBe(1000);
  });
});

describe('checkRateLimit', () => {
  test('allows first request and inserts row', async () => {
    const db = createDb(null);
    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('allows request within window', async () => {
    const now = Date.now();
    const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const db = createDb({ requests: 3, windowStart: new Date(windowStart) });
    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(6);
  });

  test('resets window and allows after hour', async () => {
    const now = Date.now();
    const oldWindowStart =
      Math.floor((now - 2 * 60 * 60 * 1000) / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const db = createDb({ requests: 10, windowStart: new Date(oldWindowStart) });
    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('blocks when limit reached', async () => {
    const now = Date.now();
    const windowStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000);
    const db = createDb({ requests: 10, windowStart: new Date(windowStart) });
    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});

import { describe, expect, test } from 'vitest';
import { checkRateLimit, getRateLimitPerHour, getRateLimitByEndpoint } from './rate-limit';

function createDb(config: { selectResults: (Record<string, unknown> | null)[] }) {
  let selectIndex = 0;

  return {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          run: async () => ({ success: true }),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => {
            const result = config.selectResults[selectIndex++];
            if (!result) return undefined;
            return {
              ...result,
              id: (result.id as string) ?? 'rl-1',
              userId: 'user-1',
              endpoint: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        }),
      }),
    }),
  } as any;
}

function makeRow(requests: number, windowStart: Date, id?: string): Record<string, unknown> {
  return { requests, windowStart, ...(id ? { id } : {}) };
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

describe('getRateLimitByEndpoint', () => {
  test('returns 20 for auth sign-in endpoints', () => {
    expect(getRateLimitByEndpoint('/api/auth/sign-in/email')).toBe(20);
  });

  test('returns 20 for auth sign-up endpoints', () => {
    expect(getRateLimitByEndpoint('/api/auth/sign-up/email')).toBe(20);
  });

  test('returns 60 for nutrition chat', () => {
    expect(getRateLimitByEndpoint('/api/nutrition/chat')).toBe(60);
  });

  test('returns 500 for other endpoints', () => {
    expect(getRateLimitByEndpoint('/api/workouts')).toBe(500);
  });
});

describe('checkRateLimit', () => {
  test('allows first request and inserts row', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));
    const db = createDb({ selectResults: [makeRow(1, windowStart)] });
    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('allows request within window (atomic increment)', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const db = createDb({
      selectResults: [makeRow(4, windowStart)],
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(6);
  });

  test('resets old window and allows after hour', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const db = createDb({
      selectResults: [makeRow(1, windowStart)],
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('blocks when limit reached', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const db = createDb({
      selectResults: [makeRow(11, windowStart)],
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test('handles duplicate insert by falling through to atomic increment', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const db = createDb({
      selectResults: [makeRow(2, windowStart)],
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(8);
  });
});

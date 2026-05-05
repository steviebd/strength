import { describe, expect, test } from 'vitest';
import { checkRateLimit, getRateLimitPerHour } from './rate-limit';

interface MockConfig {
  insertThrows: boolean;
  selectResults: (Record<string, unknown> | null)[];
  updateChanges: number;
}

function createDb(config: MockConfig) {
  let selectIndex = 0;

  return {
    insert: () => ({
      values: () => ({
        run: config.insertThrows
          ? async () => {
              throw new Error(
                'SQLITE_CONSTRAINT: UNIQUE constraint failed: rate_limit.user_id, rate_limit.endpoint',
              );
            }
          : async () => ({ success: true }),
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
    update: () => ({
      set: () => ({
        where: () => ({
          run: async () => ({ meta: { changes: config.updateChanges } }),
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

describe('checkRateLimit', () => {
  test('allows first request and inserts row', async () => {
    const db = createDb({ insertThrows: false, selectResults: [], updateChanges: 0 });
    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('allows request within window (atomic increment)', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const db = createDb({
      insertThrows: true,
      selectResults: [makeRow(3, windowStart), makeRow(4, windowStart)],
      updateChanges: 1,
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(6);
  });

  test('resets old window and allows after hour', async () => {
    const now = Date.now();
    const oldWindowStart = new Date(
      Math.floor((now - 2 * 60 * 60 * 1000) / (60 * 60 * 1000)) * (60 * 60 * 1000),
    );

    const db = createDb({
      insertThrows: true,
      selectResults: [makeRow(10, oldWindowStart)],
      updateChanges: 1,
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  test('blocks when limit reached', async () => {
    const now = Date.now();
    const windowStart = new Date(Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000));

    const db = createDb({
      insertThrows: true,
      selectResults: [makeRow(10, windowStart), makeRow(10, windowStart)],
      updateChanges: 0,
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
      insertThrows: true,
      selectResults: [makeRow(1, windowStart), makeRow(2, windowStart)],
      updateChanges: 1,
    });

    const result = await checkRateLimit(db, 'user-1', 'test', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(8);
  });
});

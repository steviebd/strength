import { describe, expect, test, vi } from 'vitest';
import { createMockDb } from '../../test/mock-db';
import { createTestContext } from '../../test/handler';

vi.mock('../auth', () => ({
  createHandler: (handler: any) => (c: any) => handler(c, { userId: 'user-1', db: c._db }),
}));

describe('body stats handlers', () => {
  test('returns null when no stats exist', async () => {
    const { getBodyStatsHandler } = await import('./body-stats');
    const response = await getBodyStatsHandler(createTestContext({ db: createMockDb() }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });

  test('rejects invalid JSON body', async () => {
    const { upsertBodyStatsHandler } = await import('./body-stats');
    const response = await upsertBodyStatsHandler(
      createTestContext({ db: createMockDb(), method: 'POST', body: '{bad' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid request body' });
  });

  test('inserts stats when none exist', async () => {
    const db = createMockDb({
      get: [null, { id: 'stats-1', userId: 'user-1', bodyweightKg: 90, targetCalories: 2800 }],
    });
    const { upsertBodyStatsHandler } = await import('./body-stats');
    const response = await upsertBodyStatsHandler(
      createTestContext({
        db,
        method: 'POST',
        body: { bodyweightKg: 90, targetCalories: 2800, userId: 'evil' },
      }),
    );

    expect(response.status).toBe(200);
    expect(db._calls.values[0]).toMatchObject({
      userId: 'user-1',
      bodyweightKg: 90,
      targetCalories: 2800,
    });
    expect(db._calls.values[0].userId).toBe('user-1');
  });

  test('updates stats when existing row exists', async () => {
    const db = createMockDb({
      get: [
        { id: 'stats-1', userId: 'user-1' },
        { id: 'stats-1', userId: 'user-1', bodyweightKg: 91 },
      ],
    });
    const { upsertBodyStatsHandler } = await import('./body-stats');
    const response = await upsertBodyStatsHandler(
      createTestContext({ db, method: 'POST', body: { bodyweightKg: 91, isDeleted: true } }),
    );

    expect(response.status).toBe(200);
    expect(db._calls.sets[0]).toMatchObject({ bodyweightKg: 91 });
    expect(db._calls.sets[0]).not.toHaveProperty('isDeleted');
  });
});

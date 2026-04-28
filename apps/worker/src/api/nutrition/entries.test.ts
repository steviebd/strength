import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDb } from '../../test/mock-db';
import { createTestContext } from '../../test/handler';

vi.mock('../auth', () => ({
  createHandler: (handler: any) => (c: any) => handler(c, { userId: 'user-1', db: c._db }),
}));

vi.mock('../../lib/timezone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/timezone')>();
  return {
    ...actual,
    resolveUserTimezone: vi.fn().mockResolvedValue({ timezone: 'Australia/Sydney', error: null }),
  };
});

describe('nutrition entries handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('requires date query parameter', async () => {
    const { getEntriesHandler } = await import('./entries');
    const response = await getEntriesHandler(createTestContext({ db: createMockDb() }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'date query parameter is required' });
  });

  test('rejects invalid date formats', async () => {
    const { getEntriesHandler } = await import('./entries');
    const response = await getEntriesHandler(
      createTestContext({ db: createMockDb(), url: 'http://local.test/?date=04/28/2026' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid date format. Use YYYY-MM-DD',
    });
  });

  test('lists non-deleted entries for local date range', async () => {
    const entry = { id: 'entry-1', userId: 'user-1', name: 'Eggs', isDeleted: false };
    const db = createMockDb({ all: [[entry]] });
    const { getEntriesHandler } = await import('./entries');
    const response = await getEntriesHandler(
      createTestContext({ db, url: 'http://local.test/?date=2026-04-28' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([entry]);
    expect(db._calls.where).toHaveLength(1);
  });

  test('rejects invalid create body and missing name', async () => {
    const { createEntryHandler } = await import('./entries');

    const invalid = await createEntryHandler(
      createTestContext({ db: createMockDb(), method: 'POST', body: '{bad' }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'Invalid request body' });

    const missingName = await createEntryHandler(
      createTestContext({ db: createMockDb(), method: 'POST', body: {} }),
    );
    expect(missingName.status).toBe(400);
    await expect(missingName.json()).resolves.toEqual({ error: 'name is required' });
  });

  test('creates entry with parsed loggedAt date', async () => {
    const db = createMockDb({
      get: [{ id: 'entry-1', name: 'Chicken', loggedAt: new Date('2026-04-28T02:00:00.000Z') }],
    });
    const { createEntryHandler } = await import('./entries');
    const response = await createEntryHandler(
      createTestContext({
        db,
        method: 'POST',
        body: { name: 'Chicken', calories: 300, loggedAt: '2026-04-28T02:00:00.000Z' },
      }),
    );

    expect(response.status).toBe(201);
    expect(db._calls.values[0]).toMatchObject({
      userId: 'user-1',
      name: 'Chicken',
      calories: 300,
      loggedAt: new Date('2026-04-28T02:00:00.000Z'),
    });
  });
});

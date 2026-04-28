import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMockDb } from '../../test/mock-db';
import { createTestContext } from '../../test/handler';

const requireOwnedNutritionEntry = vi.hoisted(() => vi.fn());

vi.mock('../auth', () => ({
  createHandler: (handler: any) => (c: any) => handler(c, { userId: 'user-1', db: c._db }),
}));

vi.mock('../guards', () => ({
  requireOwnedNutritionEntry,
}));

describe('nutrition entry by id handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns 404 from ownership guard without leaking data', async () => {
    requireOwnedNutritionEntry.mockResolvedValue(
      Response.json({ message: 'Not found' }, { status: 404 }),
    );
    const { getEntryHandler } = await import('./entries.$id');
    const response = await getEntryHandler(
      createTestContext({ db: createMockDb(), params: { id: 'entry-1' } }),
    );

    expect(response.status).toBe(404);
  });

  test('updates only allowed entry fields and rejects invalid loggedAt', async () => {
    requireOwnedNutritionEntry.mockResolvedValue({ id: 'entry-1', userId: 'user-1' });
    const { updateEntryHandler } = await import('./entries.$id');

    const invalid = await updateEntryHandler(
      createTestContext({
        db: createMockDb(),
        method: 'PUT',
        params: { id: 'entry-1' },
        body: { loggedAt: 'not-a-date' },
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'Invalid loggedAt value' });

    const db = createMockDb({ get: [{ id: 'entry-1', name: 'Updated' }] });
    const response = await updateEntryHandler(
      createTestContext({
        db,
        method: 'PUT',
        params: { id: 'entry-1' },
        body: { name: 'Updated', userId: 'evil', isDeleted: true },
      }),
    );

    expect(response.status).toBe(200);
    expect(db._calls.sets[0]).toMatchObject({ name: 'Updated' });
    expect(db._calls.sets[0]).not.toHaveProperty('userId');
    expect(db._calls.sets[0]).not.toHaveProperty('isDeleted');
  });

  test('soft deletes owned entries', async () => {
    requireOwnedNutritionEntry.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      isDeleted: false,
    });
    const db = createMockDb();
    const { deleteEntryHandler } = await import('./entries.$id');
    const response = await deleteEntryHandler(
      createTestContext({ db, method: 'DELETE', params: { id: 'entry-1' } }),
    );

    expect(response.status).toBe(204);
    expect(db._calls.sets[0]).toMatchObject({ isDeleted: true });
  });
});

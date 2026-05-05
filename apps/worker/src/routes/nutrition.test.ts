import { describe, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as schema from '@strength/db';
import { Hono } from 'hono';

const requireOwnedRecord = vi.hoisted(() => vi.fn());

vi.mock('../api/auth', () => ({
  createHandler: (handler: any) => (c: any) => handler(c, { userId: 'user-1', db: c.env.DB }),
}));

vi.mock('../api/guards', () => ({
  requireOwnedRecord,
}));

describe('nutrition routes', () => {
  test('routes DELETE /entries/:id to the nutrition entry delete handler', async () => {
    requireOwnedRecord.mockResolvedValue({
      id: 'entry-1',
      userId: 'user-1',
      isDeleted: false,
    });

    const { default: nutritionRouter } = await import('./nutrition');
    const app = new Hono();
    app.route('/api/nutrition', nutritionRouter);

    const db = {
      update: () => db,
      set: () => db,
      where: () => db,
      run: async () => ({ success: true }),
    };

    const res = await app.request(
      '/api/nutrition/entries/entry-1',
      { method: 'DELETE' },
      { DB: db },
    );

    expect(res.status).toBe(204);
    expect(requireOwnedRecord).toHaveBeenCalledWith(
      { db, userId: 'user-1' },
      schema.nutritionEntries,
      'entry-1',
      {
        extraConditions: [eq(schema.nutritionEntries.isDeleted, false)],
        notFoundBody: { error: 'Nutrition entry not found' },
      },
    );
  });
});

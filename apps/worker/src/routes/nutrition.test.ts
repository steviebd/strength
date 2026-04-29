import { describe, expect, test, vi } from 'vitest';
import { Hono } from 'hono';

const requireOwnedNutritionEntry = vi.hoisted(() => vi.fn());

vi.mock('../api/auth', () => ({
  createHandler: (handler: any) => (c: any) => handler(c, { userId: 'user-1', db: c.env.DB }),
}));

vi.mock('../api/guards', () => ({
  requireOwnedNutritionEntry,
}));

describe('nutrition routes', () => {
  test('routes DELETE /entries/:id to the nutrition entry delete handler', async () => {
    requireOwnedNutritionEntry.mockResolvedValue({
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
    expect(requireOwnedNutritionEntry).toHaveBeenCalledWith({ db, userId: 'user-1' }, 'entry-1');
  });
});

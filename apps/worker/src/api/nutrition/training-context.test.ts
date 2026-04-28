import { describe, expect, test, vi } from 'vitest';
import { createMockDb } from '../../test/mock-db';
import { createTestContext } from '../../test/handler';

vi.mock('../auth', () => ({
  createHandler: (handler: any) => (c: any) => handler(c, { userId: 'user-1', db: c._db }),
}));

describe('training context handler', () => {
  test('rejects invalid JSON and missing training type', async () => {
    const { upsertTrainingContextHandler } = await import('./training-context');

    const invalid = await upsertTrainingContextHandler(
      createTestContext({ db: createMockDb(), method: 'POST', body: '{bad' }),
    );
    expect(invalid.status).toBe(400);

    const missing = await upsertTrainingContextHandler(
      createTestContext({ db: createMockDb(), method: 'POST', body: {} }),
    );
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ error: 'trainingType is required' });
  });

  test('rejects unknown training type', async () => {
    const { upsertTrainingContextHandler } = await import('./training-context');
    const response = await upsertTrainingContextHandler(
      createTestContext({ db: createMockDb(), method: 'POST', body: { trainingType: 'yoga' } }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid trainingType' });
  });

  test('inserts and updates training context rows', async () => {
    const { upsertTrainingContextHandler } = await import('./training-context');
    const insertDb = createMockDb({
      get: [null, { trainingType: 'powerlifting', customLabel: null }],
    });
    const inserted = await upsertTrainingContextHandler(
      createTestContext({
        db: insertDb,
        method: 'POST',
        body: { trainingType: 'powerlifting', userId: 'evil' },
      }),
    );

    expect(inserted.status).toBe(200);
    expect(insertDb._calls.values[0]).toMatchObject({
      userId: 'user-1',
      trainingType: 'powerlifting',
    });

    const updateDb = createMockDb({
      get: [
        { id: 'ctx-1', userId: 'user-1' },
        { trainingType: 'custom', customLabel: 'Meet prep' },
      ],
    });
    const updated = await upsertTrainingContextHandler(
      createTestContext({
        db: updateDb,
        method: 'POST',
        body: { type: 'custom', customLabel: 'Meet prep' },
      }),
    );

    expect(updated.status).toBe(200);
    expect(updateDb._calls.sets[0]).toMatchObject({
      trainingType: 'custom',
      customLabel: 'Meet prep',
    });
  });
});

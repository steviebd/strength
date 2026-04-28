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

vi.mock('../../lib/whoop-queries', () => ({
  getWhoopDataForDay: vi.fn().mockResolvedValue({
    recoveryScore: null,
    recoveryStatus: null,
    hrv: null,
    restingHeartRate: null,
    caloriesBurned: null,
    totalStrain: null,
  }),
}));

describe('daily nutrition summary handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('requires a valid date', async () => {
    const { dailySummaryHandler } = await import('./daily-summary');

    const missing = await dailySummaryHandler(createTestContext({ db: createMockDb() }));
    expect(missing.status).toBe(400);

    const invalid = await dailySummaryHandler(
      createTestContext({ db: createMockDb(), url: 'http://local.test/?date=bad' }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: 'Invalid date format. Use YYYY-MM-DD' });
  });

  test('aggregates entries and bodyweight macro targets', async () => {
    const db = createMockDb({
      all: [
        [
          {
            id: 'entry-1',
            name: 'Breakfast',
            mealType: 'Breakfast',
            calories: 500,
            proteinG: 30,
            carbsG: 50,
            fatG: 15,
            loggedAt: new Date('2026-04-27T22:00:00.000Z'),
          },
          {
            id: 'entry-2',
            name: 'Lunch',
            mealType: 'Lunch',
            calories: 700,
            proteinG: 45,
            carbsG: 80,
            fatG: 20,
            loggedAt: new Date('2026-04-28T03:00:00.000Z'),
          },
        ],
      ],
      get: [
        {
          bodyweightKg: 90,
          targetCalories: null,
          targetProteinG: null,
          targetCarbsG: null,
          targetFatG: null,
        },
        { trainingType: 'powerlifting', customLabel: null },
      ],
    });
    const { dailySummaryHandler } = await import('./daily-summary');
    const response = await dailySummaryHandler(
      createTestContext({ db, url: 'http://local.test/?date=2026-04-28' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      totals: { calories: 1200, proteinG: 75, carbsG: 130, fatG: 35 },
      targets: { calories: 2750, proteinG: 180 },
      targetMeta: { strategy: 'bodyweight', calorieMultiplier: 1.1 },
      trainingContext: { type: 'powerlifting' },
    });
  });
});

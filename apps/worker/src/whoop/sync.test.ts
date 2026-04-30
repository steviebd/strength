import { describe, expect, test } from 'vitest';
import { createMockDb } from '../test/mock-db';
import { getSyncStartDate, upsertWhoopCycle, upsertWhoopProfile, upsertWhoopWorkout } from './sync';

describe('whoop sync upserts', () => {
  test('upserts profile with stable provider identity', async () => {
    const db = createMockDb();

    await expect(
      upsertWhoopProfile(db as never, 'user-1', {
        user_id: 123,
        email: 'user@example.com',
        first_name: 'Test',
        last_name: 'User',
      } as never),
    ).resolves.toBe(1);

    expect(db._calls.values[0]).toMatchObject({
      userId: 'user-1',
      whoopUserId: '123',
      email: 'user@example.com',
      firstName: 'Test',
      lastName: 'User',
    });
  });

  test('upserts workout score and zone duration payloads', async () => {
    const db = createMockDb();

    await expect(
      upsertWhoopWorkout(db as never, 'user-1', {
        id: 'workout-1',
        start: '2026-04-28T01:00:00.000Z',
        end: '2026-04-28T02:00:00.000Z',
        timezone_offset: '+10:00',
        sport_name: 'Weightlifting',
        score_state: 'SCORED',
        score: { strain: 12.5, zone_durations: { zone_one_milli: 1000 } },
      } as never),
    ).resolves.toBe(1);

    expect(db._calls.values[0]).toMatchObject({
      userId: 'user-1',
      whoopWorkoutId: 'workout-1',
      sportName: 'Weightlifting',
      scoreState: 'SCORED',
      zoneDuration: JSON.stringify({ zone_one_milli: 1000 }),
    });
  });

  test('upserts cycle derived score fields', async () => {
    const db = createMockDb();

    await expect(
      upsertWhoopCycle(db as never, 'user-1', {
        id: 'cycle-1',
        start: '2026-04-28T00:00:00.000Z',
        end: '2026-04-29T00:00:00.000Z',
        timezone_offset: '+10:00',
        score: {
          strain: 10.2,
          average_heart_rate: 70,
          max_heart_rate: 150,
          kilojoule: 9000,
        },
      } as never),
    ).resolves.toBe(1);

    expect(db._calls.values[0]).toMatchObject({
      userId: 'user-1',
      whoopCycleId: 'cycle-1',
      dayStrain: 10.2,
      averageHeartRate: 70,
      maxHeartRate: 150,
      kilojoule: 9000,
    });
  });
});

describe('getSyncStartDate', () => {
  test('initial sync returns 365 days ago', () => {
    const result = getSyncStartDate(null, true);
    const expected = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBeCloseTo(expected.getTime(), -3);
  });

  test('incremental sync with no data returns 365 days ago', () => {
    const result = getSyncStartDate(null, false);
    const expected = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBeCloseTo(expected.getTime(), -3);
  });

  test('incremental sync uses 7-day overlap from latest date', () => {
    const latest = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = getSyncStartDate(latest, false);
    const expected = new Date(latest.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBeCloseTo(expected.getTime(), -3);
  });

  test('incremental sync caps at 365 days', () => {
    const latest = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const result = getSyncStartDate(latest, false);
    const expected = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBeCloseTo(expected.getTime(), -3);
  });

  test('accepts numeric timestamps', () => {
    const latest = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const result = getSyncStartDate(latest, false);
    const expected = new Date(latest - 7 * 24 * 60 * 60 * 1000);
    expect(result.getTime()).toBeCloseTo(expected.getTime(), -3);
  });
});

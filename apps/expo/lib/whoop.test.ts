import { describe, expect, test } from 'vitest';
import { transformWhoopData } from './whoop';

describe('transformWhoopData', () => {
  test('camel-cases keys and normalizes timestamps and numbers', () => {
    const result = transformWhoopData({
      recovery: [
        {
          id: 'rec-1',
          date: '2026-04-28T00:00:00.000Z',
          recovery_score: '76',
          resting_heart_rate: '52',
        },
      ],
      sleep: [],
      cycles: [{ id: 'cycle-1', start: '2026-04-28T01:00:00.000Z', day_strain: '12.4' }],
      workouts: [{ id: 'workout-1', average_heart_rate: '140', max_heart_rate: null }],
    });

    expect(result.recovery[0]).toMatchObject({
      id: 'rec-1',
      date: Date.parse('2026-04-28T00:00:00.000Z'),
      recoveryScore: 76,
      restingHeartRate: 52,
    });
    expect(result.cycles[0]).toMatchObject({
      id: 'cycle-1',
      start: Date.parse('2026-04-28T01:00:00.000Z'),
      dayStrain: 12.4,
    });
    expect(result.workouts[0]).toMatchObject({
      id: 'workout-1',
      averageHeartRate: 140,
      maxHeartRate: null,
    });
  });

  test('preserves missing optional arrays as empty outputs', () => {
    expect(transformWhoopData({ recovery: [], sleep: [], cycles: [], workouts: [] })).toEqual({
      recovery: [],
      sleep: [],
      cycles: [],
      workouts: [],
    });
  });
});

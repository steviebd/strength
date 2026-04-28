import { describe, expect, test } from 'vitest';
import { buildOneRMTestWorkoutUpdate } from './program-cycles';

describe('buildOneRMTestWorkoutUpdate', () => {
  test('includes explicit fields only', () => {
    const body = {
      squat1rm: 100,
      bench1rm: 80,
      deadlift1rm: 140,
      ohp1rm: 50,
      startingSquat1rm: 90,
      extra: 'bad',
    };
    const result = buildOneRMTestWorkoutUpdate(body);
    expect(result).toHaveProperty('squat1rm', 100);
    expect(result).toHaveProperty('bench1rm', 80);
    expect(result).toHaveProperty('deadlift1rm', 140);
    expect(result).toHaveProperty('ohp1rm', 50);
    expect(result).toHaveProperty('startingSquat1rm', 90);
    expect(result).not.toHaveProperty('extra');
  });
});

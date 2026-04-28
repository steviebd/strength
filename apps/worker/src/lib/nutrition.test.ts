import { describe, expect, test } from 'vitest';
import { calculateMacroTargets } from './nutrition';

describe('calculateMacroTargets', () => {
  test('uses manual calorie targets with bodyweight fallbacks', () => {
    expect(calculateMacroTargets(90, 'powerlifting', 2500, { targetCalories: 3000 })).toEqual({
      calories: 3000,
      proteinG: 180,
      carbsG: 270,
      fatG: 72,
    });
  });

  test('scales calories by training context and derives macros', () => {
    expect(calculateMacroTargets(100, 'powerlifting', 2500)).toEqual({
      calories: 2750,
      proteinG: 200,
      carbsG: 245,
      fatG: 80,
    });
    expect(calculateMacroTargets(100, 'rest_day', 2500).calories).toBe(2375);
    expect(calculateMacroTargets(100, 'cardio', 2500).calories).toBe(2625);
  });

  test('does not return negative carbs for low calories', () => {
    expect(calculateMacroTargets(150, null, 1000).carbsG).toBe(0);
  });
});

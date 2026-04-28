import { describe, expect, test } from 'vitest';
import {
  calculateAccessoryWeight,
  generateWorkoutAccessories,
  getLibraryIdForAccessory,
  parseReps,
} from './accessory-data';

const oneRMs = { squat: 180, bench: 120, deadlift: 220, ohp: 80 };

describe('accessory data', () => {
  test('returns library IDs and calculates percentage based weights', () => {
    expect(getLibraryIdForAccessory('dips')).toBe('chest-dips');
    expect(getLibraryIdForAccessory('unknown')).toBeNull();
    expect(calculateAccessoryWeight('dips', oneRMs)).toBe(60);
    expect(calculateAccessoryWeight('pushups', oneRMs, 10)).toBe(10);
    expect(calculateAccessoryWeight('unknown', oneRMs)).toBe(0);
  });

  test('parses reps conservatively', () => {
    expect(parseReps(12)).toEqual({ numericValue: 12, rawString: '12' });
    expect(parseReps('30 sec plank')).toEqual({ numericValue: 30, rawString: '30 sec plank' });
    expect(parseReps('AMRAP')).toEqual({ numericValue: 0, rawString: 'AMRAP' });
  });

  test('generates concrete workout accessories', () => {
    const result = generateWorkoutAccessories(
      [{ accessoryId: 'dips', sets: 3, reps: 'AMRAP', isRequired: true }],
      oneRMs,
    );

    expect(result).toEqual([
      expect.objectContaining({
        accessoryId: 'dips',
        name: 'Dips',
        sets: 3,
        reps: 'AMRAP',
        targetWeight: 60,
        isRequired: true,
        isAmrap: true,
      }),
    ]);
  });
});


import { describe, expect, test } from 'vitest';
import { serializePreferences } from './profile';

describe('serializePreferences', () => {
  test('includes bodyweight and updatedAt in startup preferences payload', () => {
    const updatedAt = new Date('2026-04-28T01:00:00.000Z');
    const weightPromptedAt = new Date('2026-04-28T00:00:00.000Z');

    const result = serializePreferences(
      {
        userId: 'user-1',
        weightUnit: 'lbs',
        distanceUnit: 'km',
        heightUnit: 'in',
        timezone: 'Australia/Sydney',
        weightPromptedAt,
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
        updatedAt,
      },
      {
        id: 'stats-1',
        userId: 'user-1',
        bodyweightKg: 90.5,
        heightCm: null,
        targetCalories: null,
        targetProteinG: null,
        targetCarbsG: null,
        targetFatG: null,
        recordedAt: null,
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
        updatedAt,
      },
    );

    expect(result).toEqual({
      weightUnit: 'lbs',
      distanceUnit: 'km',
      heightUnit: 'in',
      timezone: 'Australia/Sydney',
      weightPromptedAt,
      bodyweightKg: 90.5,
      updatedAt,
    });
  });

  test('defaults nullable fields when body stats are missing', () => {
    const updatedAt = new Date('2026-04-28T01:00:00.000Z');

    const result = serializePreferences(
      {
        userId: 'user-1',
        weightUnit: null,
        distanceUnit: null,
        heightUnit: null,
        timezone: null,
        weightPromptedAt: null,
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
        updatedAt,
      },
      null,
    );

    expect(result).toEqual({
      weightUnit: 'kg',
      distanceUnit: 'km',
      heightUnit: 'cm',
      timezone: null,
      weightPromptedAt: null,
      bodyweightKg: null,
      updatedAt,
    });
  });
});

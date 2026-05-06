import { describe, expect, test } from 'vitest';
import {
  applyProgressionToHistorySet,
  buildProgressedHistorySnapshot,
  getDefaultProgressionIncrement,
  getDefaultProgressionForExercise,
  getLastWorkoutSummary,
  getSuggestedSummary,
  hasProgressionHistoryData,
  hasWeightInSets,
} from './workout-progression';
import type { ExerciseHistorySnapshot } from '@/db/workouts';

describe('workout progression helpers', () => {
  test('uses unit-specific default increments', () => {
    expect(getDefaultProgressionIncrement('kg')).toBe(2.5);
    expect(getDefaultProgressionIncrement('lbs')).toBe(5);
  });

  test('getDefaultProgressionForExercise returns type-aware defaults', () => {
    expect(getDefaultProgressionForExercise('weights', true, 'kg')).toEqual({
      increment: 2.5,
      deltaLabel: '+2.5 kg',
    });
    expect(getDefaultProgressionForExercise('bodyweight', false, 'kg')).toEqual({
      increment: 2,
      deltaLabel: '+2 reps',
    });
    expect(getDefaultProgressionForExercise('cardio', false, 'kg')).toEqual({
      increment: 60,
      deltaLabel: '+1:00 min',
    });
    expect(getDefaultProgressionForExercise('timed', false, 'kg')).toEqual({
      increment: 5,
      deltaLabel: '+5 sec',
    });
    expect(getDefaultProgressionForExercise('plyo', false, 'kg')).toEqual({
      increment: 1,
      deltaLabel: '+1 rep',
    });
  });

  test('hasWeightInSets detects weight presence', () => {
    expect(hasWeightInSets([{ weight: null }])).toBe(false);
    expect(hasWeightInSets([{ weight: 0 }])).toBe(false);
    expect(hasWeightInSets([{ weight: 10 }])).toBe(true);
  });

  test('hasProgressionHistoryData accepts non-strength history fields', () => {
    expect(
      hasProgressionHistoryData({
        sets: [
          {
            setNumber: 1,
            weight: null,
            reps: null,
            rpe: null,
            duration: 600,
            distance: 2100,
            height: null,
          },
        ],
      }),
    ).toBe(true);
  });

  test('getLastWorkoutSummary returns highest weight for weighted', () => {
    const sets = [
      {
        setNumber: 1,
        weight: 40,
        reps: 8,
        rpe: null,
        duration: null,
        distance: null,
        height: null,
      },
      {
        setNumber: 2,
        weight: 45,
        reps: 6,
        rpe: null,
        duration: null,
        distance: null,
        height: null,
      },
    ];
    expect(getLastWorkoutSummary(sets, 'weights', 'kg')).toBe('45 kg × 6 reps');
  });

  test('getLastWorkoutSummary returns max reps for bodyweight without weight', () => {
    const sets = [
      {
        setNumber: 1,
        weight: null,
        reps: 10,
        rpe: null,
        duration: null,
        distance: null,
        height: null,
      },
      {
        setNumber: 2,
        weight: null,
        reps: 12,
        rpe: null,
        duration: null,
        distance: null,
        height: null,
      },
    ];
    expect(getLastWorkoutSummary(sets, 'bodyweight', 'kg')).toBe('12 reps');
  });

  test('getLastWorkoutSummary returns duration and distance for cardio', () => {
    const sets = [
      {
        setNumber: 1,
        weight: null,
        reps: null,
        rpe: null,
        duration: 600,
        distance: 2100,
        height: null,
      },
    ];
    expect(getLastWorkoutSummary(sets, 'cardio', 'kg')).toBe('10:00 • 2.1 km');
  });

  test('getLastWorkoutSummary returns duration for timed', () => {
    const sets = [
      {
        setNumber: 1,
        weight: null,
        reps: null,
        rpe: null,
        duration: 60,
        distance: null,
        height: null,
      },
    ];
    expect(getLastWorkoutSummary(sets, 'timed', 'kg')).toBe('1:00');
  });

  test('getSuggestedSummary increments weight for weighted', () => {
    const sets = [
      {
        setNumber: 1,
        weight: 40,
        reps: 8,
        rpe: null,
        duration: null,
        distance: null,
        height: null,
      },
    ];
    expect(getSuggestedSummary(sets, 'weights', 2.5, 'kg')).toEqual({
      summary: '42.5 kg × 8 reps',
      delta: '+2.5 kg',
    });
  });

  test('getSuggestedSummary increments reps for bodyweight without weight', () => {
    const sets = [
      {
        setNumber: 1,
        weight: null,
        reps: 10,
        rpe: null,
        duration: null,
        distance: null,
        height: null,
      },
    ];
    expect(getSuggestedSummary(sets, 'bodyweight', 2, 'kg')).toEqual({
      summary: '12 reps',
      delta: '+2 reps',
    });
  });

  test('getSuggestedSummary increments duration for cardio', () => {
    const sets = [
      {
        setNumber: 1,
        weight: null,
        reps: null,
        rpe: null,
        duration: 600,
        distance: 2100,
        height: null,
      },
    ];
    expect(getSuggestedSummary(sets, 'cardio', 60, 'kg')).toEqual({
      summary: '11:00 • 2.1 km',
      delta: '+1:00 min',
    });
  });

  test('getSuggestedSummary increments duration for timed', () => {
    const sets = [
      {
        setNumber: 1,
        weight: null,
        reps: null,
        rpe: null,
        duration: 60,
        distance: null,
        height: null,
      },
    ];
    expect(getSuggestedSummary(sets, 'timed', 5, 'kg')).toEqual({
      summary: '1:05',
      delta: '+5 sec',
    });
  });

  test('adds increment to weighted set weight while preserving other fields', () => {
    expect(
      applyProgressionToHistorySet(
        {
          setNumber: 1,
          weight: 80,
          reps: 5,
          rpe: 8,
          duration: null,
          distance: null,
          height: null,
        },
        2.5,
        'weights',
      ),
    ).toEqual({
      setNumber: 1,
      weight: 82.5,
      reps: 5,
      rpe: 8,
      duration: null,
      distance: null,
      height: null,
    });
  });

  test('keeps null weight null for weighted', () => {
    expect(
      applyProgressionToHistorySet(
        {
          setNumber: 1,
          weight: null,
          reps: 10,
          rpe: null,
          duration: null,
          distance: null,
          height: null,
        },
        2.5,
        'weights',
      ).weight,
    ).toBeNull();
  });

  test('supports negative custom increments', () => {
    expect(
      applyProgressionToHistorySet(
        {
          setNumber: 1,
          weight: 100,
          reps: 3,
          rpe: null,
          duration: null,
          distance: null,
          height: null,
        },
        -5,
        'weights',
      ).weight,
    ).toBe(95);
  });

  test('increments duration for cardio', () => {
    const set = {
      setNumber: 1,
      weight: null,
      reps: null,
      rpe: null,
      duration: 1800,
      distance: 5000,
      height: null,
    };
    expect(applyProgressionToHistorySet(set, 60, 'cardio')).toEqual({
      ...set,
      duration: 1860,
    });
  });

  test('increments duration for timed', () => {
    const set = {
      setNumber: 1,
      weight: null,
      reps: null,
      rpe: null,
      duration: 60,
      distance: null,
      height: null,
    };
    expect(applyProgressionToHistorySet(set, 5, 'timed')).toEqual({
      ...set,
      duration: 65,
    });
  });

  test('increments reps for plyo', () => {
    const set = {
      setNumber: 1,
      weight: null,
      reps: 10,
      rpe: null,
      duration: null,
      distance: null,
      height: null,
    };
    expect(applyProgressionToHistorySet(set, 1, 'plyo')).toEqual({
      ...set,
      reps: 11,
    });
  });

  test('increments reps for bodyweight without weight', () => {
    const set = {
      setNumber: 1,
      weight: null,
      reps: 10,
      rpe: null,
      duration: null,
      distance: null,
      height: null,
    };
    expect(applyProgressionToHistorySet(set, 2, 'bodyweight')).toEqual({
      ...set,
      reps: 12,
    });
  });

  test('builds progressed snapshots without changing set count', () => {
    const snapshot: ExerciseHistorySnapshot = {
      exerciseId: 'bench',
      workoutDate: '2026-05-01',
      isAmrap: true,
      sets: [
        {
          setNumber: 1,
          weight: 80,
          reps: 8,
          rpe: null,
          duration: null,
          distance: null,
          height: null,
        },
      ],
    };

    expect(buildProgressedHistorySnapshot(snapshot, 2.5, 'weights').sets).toEqual([
      expect.objectContaining({ weight: 82.5, reps: 8 }),
    ]);
  });
});

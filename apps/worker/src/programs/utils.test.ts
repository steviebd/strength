import { describe, expect, test } from 'vitest';
import {
  calculateWeight,
  createWaveSets,
  getAmrapTargetReps,
  getDayLifts,
  getLiftIndex,
  getNsunsSets,
  getTrainingMax,
  isAmrapSet,
  roundToPlate,
} from './utils';

describe('program utils', () => {
  test('rounds and calculates training weights', () => {
    expect(roundToPlate(101.2)).toBe(100);
    expect(roundToPlate(101.3)).toBe(102.5);
    expect(calculateWeight(180, 0.85)).toBe(152.5);
    expect(calculateWeight(180, 0.85, false)).toBe(153);
    expect(getTrainingMax(200)).toBe(180);
  });

  test('detects amrap and target reps', () => {
    expect(isAmrapSet('5+')).toBe(true);
    expect(isAmrapSet('5')).toBe(false);
    expect(getAmrapTargetReps(5)).toBe(7);
  });

  test('creates wave and deload sets', () => {
    expect(createWaveSets(1, 5, [0.7, 0.8, 0.9])).toEqual([
      { percentage: 0.7, reps: 5, isAmrap: false },
      { percentage: 0.8, reps: 5, isAmrap: false },
      { percentage: 0.9, reps: 7, isAmrap: true },
    ]);
    expect(createWaveSets(4, 5, [0.7], [0.5, 0.6])).toEqual([
      { percentage: 0.5, reps: 5, isAmrap: false },
      { percentage: 0.6, reps: 5, isAmrap: false },
    ]);
  });

  test('maps lifts and nSuns sets', () => {
    expect(getLiftIndex('deadlift')).toBe(2);
    expect(getDayLifts(5)).toEqual({ t1: 'squat', t2: 'bench' });
    expect(getNsunsSets(true, 5, 8).sets[1]).toEqual({ reps: 8, isAmrap: true });
    expect(getNsunsSets(false, 5, 8).sets[1]).toEqual({ reps: 3, isAmrap: false });
  });
});

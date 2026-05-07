import type { LiftType } from './types';

export const TRAINING_MAX_PERCENTAGE = 0.9;

export function roundToPlate(weight: number): number {
  return Math.round(weight / 2.5) * 2.5;
}

export function isAmrapSet(name: string): boolean {
  return name.endsWith('+');
}

export function getAmrapTargetReps(baseReps: number): number {
  return baseReps + 2;
}

export interface PercentageSet {
  percentage: number;
  reps: number;
  isAmrap: boolean;
}

export function createWaveSets(
  week: number,
  baseReps: number,
  percentages: number[],
  deloadPercentages?: number[],
): PercentageSet[] {
  if (week === 4 && deloadPercentages) {
    return deloadPercentages.map((p) => ({
      percentage: p,
      reps: baseReps,
      isAmrap: false,
    }));
  }

  return percentages.map((p, i) => ({
    percentage: p,
    reps: i === 2 ? baseReps + 2 : baseReps,
    isAmrap: i === 2,
  }));
}

export function calculateWeight(oneRM: number, percentage: number, round = true): number {
  const weight = oneRM * percentage;
  return round ? roundToPlate(weight) : weight;
}

export function getTrainingMax(oneRM: number): number {
  return roundToPlate(oneRM * TRAINING_MAX_PERCENTAGE);
}

export function getLiftIndex(lift: LiftType): number {
  const lifts: LiftType[] = ['squat', 'bench', 'deadlift', 'ohp'];
  return lifts.indexOf(lift);
}

type DayLiftPair = 'squat' | 'bench' | 'deadlift' | 'ohp';

export function getDayLifts(day: number): { t1: DayLiftPair; t2: DayLiftPair } {
  const dayConfigs = [
    { t1: 'squat' as const, t2: 'bench' as const },
    { t1: 'bench' as const, t2: 'squat' as const },
    { t1: 'deadlift' as const, t2: 'ohp' as const },
    { t1: 'ohp' as const, t2: 'deadlift' as const },
  ];
  return dayConfigs[(day - 1) % dayConfigs.length];
}

export const NSUNS_T1_PERCENTAGES = [0.7, 0.8, 0.9, 0.8, 0.7] as const;
export const NSUNS_T2_PERCENTAGES = [0.75, 0.85, 0.75, 0.85, 0.75] as const;

export function getNsunsSets(isAmrap: boolean, baseReps: number, amrapReps: number) {
  return {
    sets: [
      { reps: baseReps, isAmrap: false },
      { reps: isAmrap ? amrapReps : baseReps - 2, isAmrap },
      { reps: baseReps, isAmrap: false },
      { reps: baseReps - 2, isAmrap: false },
      { reps: baseReps, isAmrap: false },
    ],
  };
}

import { roundToPlate } from './utils';
import { megsquatsInfo, getMegsquatsAccessories } from './config/megsquats';

import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import { createLinearProgramGenerator } from './factory';

function getWavePercentage(week: number, setNumber: number): number {
  const waveData: Record<number, number[]> = {
    1: [0.65, 0.75, 0.85],
    2: [0.7, 0.8, 0.9],
    3: [0.75, 0.85, 0.95],
    4: [0.4, 0.5, 0.6],
  };
  return waveData[week]?.[setNumber - 1] ?? 0.65;
}

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  _session: number,
  _lift: string,
  trainingMax: number,
): number {
  const tmPercentage = trainingMax / 100;
  const wavePercentage = getWavePercentage(week, 3);
  const baseWeight = estimatedOneRM * tmPercentage * wavePercentage;
  return roundToPlate(baseWeight);
}

export const megsquats = createLinearProgramGenerator({
  info: megsquatsInfo,
  weeks: 12,
  daysPerWeek: 3,
  buildExercises: ({ week, day, oneRMs, workoutIndex }) => {
    const isDeload = week === 4 || week === 8 || week === 12;
    const isLowerA = day === 1;
    const isUpperA = day === 2;

    const weekInWave = isDeload ? 4 : ((week - 1) % 4) + 1;
    const setsConfig = isDeload
      ? [
          { sets: 5, reps: 5, isAmrap: false },
          { sets: 5, reps: 5, isAmrap: false },
          { sets: 5, reps: 5, isAmrap: true },
        ]
      : weekInWave === 1
        ? [
            { sets: 5, reps: 5, isAmrap: false },
            { sets: 5, reps: 5, isAmrap: false },
            { sets: 5, reps: 5, isAmrap: true },
          ]
        : weekInWave === 2
          ? [
              { sets: 3, reps: 3, isAmrap: false },
              { sets: 3, reps: 3, isAmrap: false },
              { sets: 3, reps: 3, isAmrap: true },
            ]
          : weekInWave === 3
            ? [
                { sets: 5, reps: 3, isAmrap: false },
                { sets: 3, reps: 3, isAmrap: false },
                { sets: 1, reps: 5, isAmrap: true },
              ]
            : [
                { sets: 5, reps: 5, isAmrap: false },
                { sets: 5, reps: 5, isAmrap: false },
                { sets: 5, reps: 5, isAmrap: true },
              ];

    const trainingMaxes = {
      squat: oneRMs.squat * 0.85,
      bench: oneRMs.bench * 0.85,
      deadlift: oneRMs.deadlift * 0.85,
      ohp: oneRMs.ohp * 0.85,
    };

    const exercises: import('./types').ProgramWorkout['exercises'] = [];

    if (isLowerA) {
      exercises.push(
        {
          name: 'Squat',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: setsConfig[0].sets,
          reps: setsConfig[0].reps,
          targetWeight: calculateTargetWeight(
            oneRMs.squat,
            weekInWave,
            workoutIndex,
            'squat',
            trainingMaxes.squat,
          ),
          isAmrap: setsConfig[0].isAmrap,
        },
        {
          name: 'Hip Thrust',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: 3,
          reps: 10,
          targetWeight: roundToPlate(oneRMs.squat * 0.6),
        },
        {
          name: 'Romanian Deadlift',
          exerciseType: 'weighted',
          lift: 'deadlift' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
          sets: 3,
          reps: 10,
          targetWeight: roundToPlate(oneRMs.deadlift * 0.6),
        },
        {
          name: 'Leg Press',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: 3,
          reps: 12,
          targetWeight: roundToPlate(oneRMs.squat * 0.8),
        },
      );
    } else if (isUpperA) {
      exercises.push(
        {
          name: 'Bench Press',
          exerciseType: 'weighted',
          lift: 'bench' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
          sets: setsConfig[0].sets,
          reps: setsConfig[0].reps,
          targetWeight: calculateTargetWeight(
            oneRMs.bench,
            weekInWave,
            workoutIndex,
            'bench',
            trainingMaxes.bench,
          ),
          isAmrap: setsConfig[0].isAmrap,
        },
        {
          name: 'Barbell Row',
          exerciseType: 'weighted',
          lift: 'row' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['row'],
          sets: setsConfig[1].sets,
          reps: setsConfig[1].reps,
          targetWeight: calculateTargetWeight(
            oneRMs.bench,
            weekInWave,
            workoutIndex,
            'row',
            trainingMaxes.bench,
          ),
          isAmrap: setsConfig[1].isAmrap,
        },
        {
          name: 'Pull-ups',
          exerciseType: 'weighted',
          lift: 'row' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['row'],
          sets: 3,
          reps: 8,
          targetWeight: 0,
        },
        {
          name: 'Tricep Pushdowns',
          exerciseType: 'weighted',
          lift: 'bench' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
          sets: 3,
          reps: 12,
          targetWeight: roundToPlate(oneRMs.bench * 0.25),
        },
        {
          name: 'Face Pulls',
          exerciseType: 'weighted',
          lift: 'ohp' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
          sets: 3,
          reps: 15,
          targetWeight: roundToPlate(oneRMs.ohp * 0.2),
        },
      );
    } else {
      exercises.push(
        {
          name: 'Deadlift',
          exerciseType: 'weighted',
          lift: 'deadlift' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
          sets: setsConfig[0].sets,
          reps: setsConfig[0].reps,
          targetWeight: calculateTargetWeight(
            oneRMs.deadlift,
            weekInWave,
            workoutIndex,
            'deadlift',
            trainingMaxes.deadlift,
          ),
          isAmrap: setsConfig[0].isAmrap,
        },
        {
          name: 'Overhead Press',
          exerciseType: 'weighted',
          lift: 'ohp' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
          sets: setsConfig[1].sets,
          reps: setsConfig[1].reps,
          targetWeight: calculateTargetWeight(
            oneRMs.ohp,
            weekInWave,
            workoutIndex,
            'ohp',
            trainingMaxes.ohp,
          ),
          isAmrap: setsConfig[1].isAmrap,
        },
        {
          name: 'Walking Lunges',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: 3,
          reps: 10,
          targetWeight: roundToPlate(oneRMs.squat * 0.35),
        },
      );
    }

    return exercises;
  },
  getAccessories: getMegsquatsAccessories,
  calculateTargetWeight: (estimatedOneRM: number, week: number, session: number, lift: string) =>
    calculateTargetWeight(estimatedOneRM, week, session, lift, estimatedOneRM * 0.85),
  getSessionNumber: ({ day }) => day,
});

export default megsquats;

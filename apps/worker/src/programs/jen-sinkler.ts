import { roundToPlate } from './utils';
import { jenSinklerInfo, getJenSinklerAccessories } from './config/jen-sinkler';

import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import { createLinearProgramGenerator } from './factory';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
): number {
  const basePercentage = 0.7;
  const weeklyIncrease = 0.025;
  const progression = (week - 1) * 3 + session;
  const weight = estimatedOneRM * (basePercentage + progression * weeklyIncrease);
  return roundToPlate(weight);
}

export const jenSinkler = createLinearProgramGenerator({
  info: jenSinklerInfo,
  weeks: 8,
  daysPerWeek: 3,
  buildExercises: ({ week, day, oneRMs, workoutIndex }) => {
    if (day === 1) {
      return [
        {
          name: 'Squat',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          sets: 5,
          reps: 5,
          targetWeight: calculateTargetWeight(oneRMs.squat, week, workoutIndex, 'squat'),
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
        },
        {
          name: 'Deadlift',
          exerciseType: 'weighted',
          lift: 'deadlift' as const,
          sets: 3,
          reps: 5,
          targetWeight: calculateTargetWeight(oneRMs.deadlift, week, workoutIndex, 'deadlift'),
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
        },
        {
          name: 'Leg Press',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          sets: 3,
          reps: 12,
          targetWeight: roundToPlate(oneRMs.squat * 0.7),
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
        },
        {
          name: 'Leg Extensions',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          sets: 3,
          reps: 15,
          targetWeight: roundToPlate(oneRMs.squat * 0.35),
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
        },
        {
          name: 'Leg Curls',
          exerciseType: 'weighted',
          lift: 'deadlift' as const,
          sets: 3,
          reps: 15,
          targetWeight: roundToPlate(oneRMs.deadlift * 0.3),
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
        },
      ];
    }

    if (day === 2) {
      return [
        {
          name: 'Bench Press',
          exerciseType: 'weighted',
          lift: 'bench' as const,
          sets: 5,
          reps: 5,
          targetWeight: calculateTargetWeight(oneRMs.bench, week, workoutIndex, 'bench'),
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
        },
        {
          name: 'Barbell Row',
          exerciseType: 'weighted',
          lift: 'row' as const,
          sets: 4,
          reps: 6,
          targetWeight: calculateTargetWeight(oneRMs.bench, week, workoutIndex, 'row'),
          libraryId: LIFT_TYPE_LIBRARY_ID['row'],
        },
        {
          name: 'Overhead Press',
          exerciseType: 'weighted',
          lift: 'ohp' as const,
          sets: 4,
          reps: 8,
          targetWeight: calculateTargetWeight(oneRMs.ohp, week, workoutIndex, 'ohp'),
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
        },
        {
          name: 'Pull-ups',
          exerciseType: 'weighted',
          lift: 'row' as const,
          sets: 3,
          reps: 8,
          targetWeight: 0,
          libraryId: LIFT_TYPE_LIBRARY_ID['row'],
        },
        {
          name: 'Tricep Pushdowns',
          exerciseType: 'weighted',
          lift: 'bench' as const,
          sets: 3,
          reps: 12,
          targetWeight: roundToPlate(oneRMs.bench * 0.25),
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
        },
        {
          name: 'Lateral Raises',
          exerciseType: 'weighted',
          lift: 'ohp' as const,
          sets: 3,
          reps: 15,
          targetWeight: roundToPlate(oneRMs.ohp * 0.15),
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
        },
      ];
    }

    return [
      {
        name: 'Overhead Press',
        exerciseType: 'weighted',
        lift: 'ohp' as const,
        sets: 4,
        reps: 6,
        targetWeight: calculateTargetWeight(oneRMs.ohp, week, workoutIndex, 'ohp'),
        libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
      },
      {
        name: 'Front Squat',
        exerciseType: 'weighted',
        lift: 'squat' as const,
        sets: 4,
        reps: 8,
        targetWeight: roundToPlate(oneRMs.squat * 0.6),
        libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
      },
      {
        name: 'Romanian Deadlift',
        exerciseType: 'weighted',
        lift: 'deadlift' as const,
        sets: 4,
        reps: 8,
        targetWeight: roundToPlate(oneRMs.deadlift * 0.65),
        libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
      },
      {
        name: 'Dumbbell Bench Press',
        exerciseType: 'weighted',
        lift: 'bench' as const,
        sets: 3,
        reps: 10,
        targetWeight: roundToPlate(oneRMs.bench * 0.5),
        libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
      },
      {
        name: 'Dumbbell Row',
        exerciseType: 'weighted',
        lift: 'row' as const,
        sets: 3,
        reps: 10,
        targetWeight: roundToPlate(oneRMs.bench * 0.4),
        libraryId: LIFT_TYPE_LIBRARY_ID['row'],
      },
    ];
  },
  getAccessories: getJenSinklerAccessories,
  calculateTargetWeight,
  getSessionNumber: ({ day }) => day,
});

export default jenSinkler;

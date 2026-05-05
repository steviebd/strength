import { roundToPlate } from './utils';
import { strongliftsInfo, getStrongliftsAccessories } from './config/stronglifts';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import { createLinearProgramGenerator } from './factory';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
): number {
  const progression = (week - 1) * 3 + session;
  const baseWeight = estimatedOneRM * 0.5;
  return roundToPlate(baseWeight + progression * 2.5);
}

export const stronglifts = createLinearProgramGenerator({
  info: strongliftsInfo,
  weeks: 12,
  daysPerWeek: 3,
  buildExercises: ({ week, day, oneRMs, workoutIndex }) => {
    const isDayA = day % 2 === 1;

    return [
      {
        name: 'Squat',
        lift: 'squat' as const,
        sets: 5,
        reps: 5,
        targetWeight: calculateTargetWeight(oneRMs.squat, week, workoutIndex, 'squat'),
        libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
      },
      ...(isDayA
        ? [
            {
              name: 'Bench Press',
              lift: 'bench' as const,
              sets: 5,
              reps: 5,
              targetWeight: calculateTargetWeight(oneRMs.bench, week, workoutIndex, 'bench'),
              libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
            },
            {
              name: 'Barbell Row',
              lift: 'row' as const,
              sets: 5,
              reps: 5,
              targetWeight: calculateTargetWeight(oneRMs.bench * 0.6, week, workoutIndex, 'row'),
              libraryId: LIFT_TYPE_LIBRARY_ID['row'],
            },
          ]
        : [
            {
              name: 'Overhead Press',
              lift: 'ohp' as const,
              sets: 5,
              reps: 5,
              targetWeight: calculateTargetWeight(oneRMs.ohp, week, workoutIndex, 'ohp'),
              libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
            },
            {
              name: 'Deadlift',
              lift: 'deadlift' as const,
              sets: 5,
              reps: 5,
              targetWeight: calculateTargetWeight(oneRMs.deadlift, week, workoutIndex, 'deadlift'),
              libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
            },
          ]),
    ];
  },
  getAccessories: getStrongliftsAccessories,
  calculateTargetWeight,
  getSessionNumber: ({ day }) => day,
});

export default stronglifts;

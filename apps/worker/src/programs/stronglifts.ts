import { roundToPlate } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { strongliftsInfo, getStrongliftsAccessories } from './config/stronglifts';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

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

export function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];
  let workoutIndex = 0;

  for (let week = 1; week <= 12; week++) {
    for (let session = 1; session <= 3; session++) {
      workoutIndex++;
      const isDayA = session % 2 === 1;

      const exercises = [
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
                targetWeight: calculateTargetWeight(
                  oneRMs.deadlift,
                  week,
                  workoutIndex,
                  'deadlift',
                ),
                libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
              },
            ]),
      ];

      workouts.push({
        weekNumber: week,
        sessionNumber: workoutIndex,
        sessionName: `Week ${week} - ${isDayA ? 'Day A' : 'Day B'}`,
        exercises,
      });
    }
  }

  for (const workout of workouts) {
    const accessories = getStrongliftsAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const stronglifts: ProgramConfig = {
  info: strongliftsInfo,
  generateWorkouts,
  calculateTargetWeight,
};

export default stronglifts;

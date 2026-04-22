import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import {
  TRAINING_MAX_PERCENTAGE,
  roundToPlate,
  NSUNS_T1_PERCENTAGES,
  NSUNS_T2_PERCENTAGES,
} from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { nsunsInfo, getNsunsAccessories } from './config/nsuns';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
  isT2 = false,
): number {
  const trainingMax = estimatedOneRM * TRAINING_MAX_PERCENTAGE;
  const weekOffset = (week - 1) * 4;
  const setIndex = (session - 1 + weekOffset) % 5;
  const percentages = isT2 ? NSUNS_T2_PERCENTAGES : NSUNS_T1_PERCENTAGES;
  const percentage = percentages[setIndex] || percentages[0];
  return roundToPlate(trainingMax * percentage);
}

export function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];

  const dayConfigs = [
    { t1: 'squat' as const, t2: 'ohp' as const },
    { t1: 'bench' as const, t2: 'squat' as const },
    { t1: 'deadlift' as const, t2: 'ohp' as const },
    { t1: 'bench' as const, t2: 'deadlift' as const },
  ];

  for (let week = 1; week <= 8; week++) {
    for (let day = 1; day <= 4; day++) {
      const config = dayConfigs[day - 1];
      const t1OneRM = oneRMs[config.t1];
      const t2OneRM = oneRMs[config.t2];

      const t1Name = config.t1.charAt(0).toUpperCase() + config.t1.slice(1);
      const t2Name = config.t2.charAt(0).toUpperCase() + config.t2.slice(1);

      const exercises = [
        {
          name: t1Name,
          lift: config.t1,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
          sets: 5,
          reps: 1,
          targetWeight: calculateTargetWeight(t1OneRM, week, day, config.t1, false),
          isAmrap: false,
        },
        {
          name: t1Name,
          lift: config.t1,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
          sets: 1,
          reps: 1,
          targetWeight: calculateTargetWeight(t1OneRM, week, day, config.t1, false),
          isAmrap: true,
        },
        {
          name: t2Name,
          lift: config.t2,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
          sets: 5,
          reps: 1,
          targetWeight: calculateTargetWeight(t2OneRM, week, day, config.t2, true),
          isAmrap: false,
        },
        {
          name: t2Name,
          lift: config.t2,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
          sets: 1,
          reps: 1,
          targetWeight: calculateTargetWeight(t2OneRM, week, day, config.t2, true),
          isAmrap: true,
        },
      ];

      const dayNames = [
        'Day 1 (Squat/OHP)',
        'Day 2 (Bench/Squat)',
        'Day 3 (Deadlift/OHP)',
        'Day 4 (Bench/Deadlift)',
      ];

      workouts.push({
        weekNumber: week,
        sessionNumber: (week - 1) * 4 + day,
        sessionName: `Week ${week} - ${dayNames[day - 1]}`,
        exercises,
      });
    }
  }

  for (const workout of workouts) {
    const accessories = getNsunsAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const nsuns: ProgramConfig = {
  info: nsunsInfo,
  generateWorkouts,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, false),
};

export default nsuns;

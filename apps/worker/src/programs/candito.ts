import { TRAINING_MAX_PERCENTAGE, roundToPlate, getDayLifts } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import {
  canditoInfo,
  STRENGTH_BLOCK,
  PEAKING_BLOCK,
  getCanditoAccessories,
} from './config/candito';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
  isT2 = false,
): number {
  const trainingMax = estimatedOneRM * TRAINING_MAX_PERCENTAGE;
  let percentage = 0.75;

  if (week <= 3) {
    const blockWeek = STRENGTH_BLOCK[week - 1];
    const setIndex = session - 1;
    percentage = blockWeek.percentages[setIndex] || blockWeek.percentages[0];
  } else {
    const blockWeek = PEAKING_BLOCK[week - 4];
    const setIndex = session - 1;
    percentage = blockWeek.percentages[setIndex] || blockWeek.percentages[0];
  }

  if (isT2) {
    percentage *= 0.75;
  }

  return roundToPlate(trainingMax * percentage);
}

export function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];

  for (let week = 1; week <= 6; week++) {
    const isStrengthBlock = week <= 3;
    const blockData = isStrengthBlock ? STRENGTH_BLOCK[week - 1] : PEAKING_BLOCK[week - 4];
    const isDeload = blockData.isDeload ?? false;

    for (let day = 1; day <= 4; day++) {
      const config = getDayLifts(day);
      const t1OneRM = oneRMs[config.t1];
      const t2OneRM = oneRMs[config.t2];

      const liftName = config.t1.charAt(0).toUpperCase() + config.t1.slice(1);
      const t2LiftName = config.t2.charAt(0).toUpperCase() + config.t2.slice(1);

      const t1Sets = [
        {
          name: liftName,
          lift: config.t1,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
          sets: blockData.sets[0],
          reps: isDeload ? 3 : blockData.baseReps,
          targetWeight: calculateTargetWeight(t1OneRM, week, 1, config.t1, false),
          isAmrap: false,
        },
        {
          name: liftName,
          lift: config.t1,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
          sets: blockData.sets[1],
          reps: isDeload ? 3 : blockData.baseReps - 1,
          targetWeight: calculateTargetWeight(t1OneRM, week, 2, config.t1, false),
          isAmrap: false,
        },
        {
          name: liftName,
          lift: config.t1,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
          sets: blockData.sets[2],
          reps: isDeload ? 3 : blockData.baseReps - 2,
          targetWeight: calculateTargetWeight(t1OneRM, week, 3, config.t1, false),
          isAmrap: true,
        },
      ];

      const t2Sets = [
        {
          name: t2LiftName,
          lift: config.t2,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
          sets: 3,
          reps: isDeload ? 4 : 6,
          targetWeight: calculateTargetWeight(t2OneRM, week, 1, config.t2, true),
          isAmrap: false,
        },
        {
          name: t2LiftName,
          lift: config.t2,
          libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
          sets: 3,
          reps: isDeload ? 4 : 6,
          targetWeight: calculateTargetWeight(t2OneRM, week, 2, config.t2, true),
          isAmrap: false,
        },
      ];

      const dayNames = [
        'Day 1 (Squat/Bench)',
        'Day 2 (Bench/Squat)',
        'Day 3 (Deadlift/OHP)',
        'Day 4 (OHP/Deadlift)',
      ];
      const blockName = isStrengthBlock ? 'Strength' : 'Peaking';

      workouts.push({
        weekNumber: week,
        sessionNumber: (week - 1) * 4 + day,
        sessionName: `Week ${week} (${blockName}) - ${dayNames[day - 1]}${isDeload ? ' (Deload)' : ''}`,
        exercises: [...t1Sets, ...t2Sets],
      });
    }
  }

  for (const workout of workouts) {
    const accessories = getCanditoAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const candito: ProgramConfig = {
  info: canditoInfo,
  generateWorkouts,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, false),
};

export default candito;

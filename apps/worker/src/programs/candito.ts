import { TRAINING_MAX_PERCENTAGE, roundToPlate, getDayLifts } from './utils';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import {
  canditoInfo,
  STRENGTH_BLOCK,
  PEAKING_BLOCK,
  getCanditoAccessories,
} from './config/candito';
import { createLinearProgramGenerator } from './factory';

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

export const candito = createLinearProgramGenerator({
  info: canditoInfo,
  weeks: 6,
  daysPerWeek: 4,
  buildExercises: ({ week, day, oneRMs }) => {
    const blockData = week <= 3 ? STRENGTH_BLOCK[week - 1] : PEAKING_BLOCK[week - 4];
    const isDeload = blockData.isDeload ?? false;
    const config = getDayLifts(day);
    const t1OneRM = oneRMs[config.t1];
    const t2OneRM = oneRMs[config.t2];

    const liftName = config.t1.charAt(0).toUpperCase() + config.t1.slice(1);
    const t2LiftName = config.t2.charAt(0).toUpperCase() + config.t2.slice(1);

    const t1Sets: import('./types').ProgramWorkout['exercises'] = [
      {
        name: liftName,
        exerciseType: 'weighted',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: blockData.sets[0],
        reps: isDeload ? 3 : blockData.baseReps,
        targetWeight: calculateTargetWeight(t1OneRM, week, 1, config.t1, false),
        isAmrap: false,
      },
      {
        name: `${liftName} 2`,
        exerciseType: 'weighted',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: blockData.sets[1],
        reps: isDeload ? 3 : blockData.baseReps - 1,
        targetWeight: calculateTargetWeight(t1OneRM, week, 2, config.t1, false),
        isAmrap: false,
      },
      {
        name: `${liftName} 3+`,
        exerciseType: 'weighted',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: blockData.sets[2],
        reps: isDeload ? 3 : blockData.baseReps - 2,
        targetWeight: calculateTargetWeight(t1OneRM, week, 3, config.t1, false),
        isAmrap: true,
      },
    ];

    const t2Sets: import('./types').ProgramWorkout['exercises'] = [
      {
        name: t2LiftName,
        exerciseType: 'weighted',
        lift: config.t2,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
        sets: 3,
        reps: isDeload ? 4 : 6,
        targetWeight: calculateTargetWeight(t2OneRM, week, 1, config.t2, true),
        isAmrap: false,
      },
      {
        name: `${t2LiftName} 2`,
        exerciseType: 'weighted',
        lift: config.t2,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
        sets: 3,
        reps: isDeload ? 4 : 6,
        targetWeight: calculateTargetWeight(t2OneRM, week, 2, config.t2, true),
        isAmrap: false,
      },
    ];

    return [...t1Sets, ...t2Sets];
  },
  getAccessories: getCanditoAccessories,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, false),
  getSessionName: ({ week, day }) => {
    const blockData = week <= 3 ? STRENGTH_BLOCK[week - 1] : PEAKING_BLOCK[week - 4];
    const isDeload = blockData.isDeload ?? false;
    return `Week ${week} - Workout ${day}${isDeload ? ' (Deload)' : ''}`;
  },
});

export default candito;

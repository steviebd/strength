import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import {
  TRAINING_MAX_PERCENTAGE,
  roundToPlate,
  NSUNS_T1_PERCENTAGES,
  NSUNS_T2_PERCENTAGES,
} from './utils';
import { nsunsInfo, getNsunsAccessories } from './config/nsuns';
import { createLinearProgramGenerator } from './factory';

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

const dayConfigs = [
  { t1: 'squat' as const, t2: 'ohp' as const },
  { t1: 'bench' as const, t2: 'squat' as const },
  { t1: 'deadlift' as const, t2: 'ohp' as const },
  { t1: 'bench' as const, t2: 'deadlift' as const },
];

export const nsuns = createLinearProgramGenerator({
  info: nsunsInfo,
  weeks: 8,
  daysPerWeek: 4,
  buildExercises: ({ week, day, oneRMs }) => {
    const config = dayConfigs[day - 1];
    const t1OneRM = oneRMs[config.t1];
    const t2OneRM = oneRMs[config.t2];

    const t1Name = config.t1.charAt(0).toUpperCase() + config.t1.slice(1);
    const t2Name = config.t2.charAt(0).toUpperCase() + config.t2.slice(1);

    return [
      {
        name: t1Name,
        exerciseType: 'weighted',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: 5,
        reps: 1,
        targetWeight: calculateTargetWeight(t1OneRM, week, day, config.t1, false),
        isAmrap: false,
      },
      {
        name: `${t1Name} 1+`,
        exerciseType: 'weighted',
        lift: config.t1,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
        sets: 1,
        reps: 1,
        targetWeight: calculateTargetWeight(t1OneRM, week, day, config.t1, false),
        isAmrap: true,
      },
      {
        name: t2Name,
        exerciseType: 'weighted',
        lift: config.t2,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
        sets: 5,
        reps: 1,
        targetWeight: calculateTargetWeight(t2OneRM, week, day, config.t2, true),
        isAmrap: false,
      },
      {
        name: `${t2Name} 1+`,
        exerciseType: 'weighted',
        lift: config.t2,
        libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
        sets: 1,
        reps: 1,
        targetWeight: calculateTargetWeight(t2OneRM, week, day, config.t2, true),
        isAmrap: true,
      },
    ];
  },
  getAccessories: getNsunsAccessories,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, false),
});

export default nsuns;

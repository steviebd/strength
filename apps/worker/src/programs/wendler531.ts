import { TRAINING_MAX_PERCENTAGE, roundToPlate } from './utils';
import { wendler531Info, WAVE_PERCENTAGES, getWendlerAccessories } from './config/wendler531';
import type { LiftType, OneRMValues } from './types';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import { createLinearProgramGenerator } from './factory';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
): number {
  const trainingMax = estimatedOneRM * TRAINING_MAX_PERCENTAGE;
  const weekData = WAVE_PERCENTAGES[week as 1 | 2 | 3 | 4];
  const setIndex = session - 1;
  const percentage = weekData.sets[setIndex] || weekData.sets[0];
  return roundToPlate(trainingMax * percentage);
}

const lifts: Array<{
  name: string;
  lift: LiftType;
  libraryId: string;
  oneRMKey: keyof OneRMValues;
}> = [
  { name: 'Squat', lift: 'squat', libraryId: LIFT_TYPE_LIBRARY_ID['squat'], oneRMKey: 'squat' },
  {
    name: 'Bench Press',
    lift: 'bench',
    libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
    oneRMKey: 'bench',
  },
  {
    name: 'Deadlift',
    lift: 'deadlift',
    libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
    oneRMKey: 'deadlift',
  },
  { name: 'Overhead Press', lift: 'ohp', libraryId: LIFT_TYPE_LIBRARY_ID['ohp'], oneRMKey: 'ohp' },
];

export const wendler531 = createLinearProgramGenerator({
  info: wendler531Info,
  weeks: 12,
  daysPerWeek: 4,
  buildExercises: ({ week, day, oneRMs }) => {
    const cycleWeek = ((week - 1) % 4) + 1;
    const weekData = WAVE_PERCENTAGES[cycleWeek as 1 | 2 | 3 | 4];
    const lift = lifts[day - 1];

    return [
      {
        name: lift.name,
        lift: lift.lift,
        libraryId: lift.libraryId,
        sets: 3,
        reps: cycleWeek === 4 ? 5 : weekData.reps[0],
        targetWeight: calculateTargetWeight(oneRMs[lift.oneRMKey], cycleWeek, 1, lift.lift),
      },
      {
        name: `${lift.name} 2`,
        lift: lift.lift,
        libraryId: lift.libraryId,
        sets: 1,
        reps: cycleWeek === 4 ? 5 : weekData.reps[1],
        targetWeight: calculateTargetWeight(oneRMs[lift.oneRMKey], cycleWeek, 2, lift.lift),
      },
      {
        name: `${lift.name} 3+`,
        lift: lift.lift,
        libraryId: lift.libraryId,
        sets: 1,
        reps: weekData.reps[2],
        targetWeight: calculateTargetWeight(oneRMs[lift.oneRMKey], cycleWeek, 3, lift.lift),
      },
    ];
  },
  getAccessories: getWendlerAccessories,
  calculateTargetWeight,
  getSessionNumber: ({ week, day }) => (Math.ceil(week / 4) - 1) * 4 + day,
});

export default wendler531;

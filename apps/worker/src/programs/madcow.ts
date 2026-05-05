import { roundToPlate } from './utils';
import { madcowInfo, WEEK_PERCENTAGES, getMadcowAccessories } from './config/madcow';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import { createLinearProgramGenerator } from './factory';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  lift: string,
): number {
  const weekData = WEEK_PERCENTAGES[week - 1];
  let percentage = 1;
  if (lift === 'squat') percentage = weekData.squat;
  else if (lift === 'bench') percentage = weekData.bench;
  else if (lift === 'deadlift') percentage = weekData.deadlift;
  else if (lift === 'ohp') percentage = weekData.ohp;
  else if (lift === 'row') percentage = weekData.bench;

  const baseWeight = estimatedOneRM * 0.75;
  const progression = (week - 1) * 3 + session;
  const increase = progression * 2.5;
  const weight = baseWeight * percentage + increase;
  return roundToPlate(weight);
}

export const madcow = createLinearProgramGenerator({
  info: madcowInfo,
  weeks: 8,
  daysPerWeek: 3,
  buildExercises: ({ week, day, oneRMs }) => {
    const weekData = WEEK_PERCENTAGES[week - 1];
    const isDeload = weekData.isDeload ?? false;
    const isDayA = day % 2 === 1;

    return [
      {
        name: 'Squat',
        lift: 'squat' as const,
        libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
        sets: 5,
        reps: isDeload ? 3 : 5,
        targetWeight: calculateTargetWeight(oneRMs.squat, week, day, 'squat'),
      },
      ...(isDayA
        ? [
            {
              name: 'Bench Press',
              lift: 'bench' as const,
              libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
              sets: 5,
              reps: isDeload ? 3 : 5,
              targetWeight: calculateTargetWeight(oneRMs.bench, week, day, 'bench'),
            },
            {
              name: 'Barbell Row',
              lift: 'row' as const,
              libraryId: LIFT_TYPE_LIBRARY_ID['row'],
              sets: 5,
              reps: isDeload ? 3 : 5,
              targetWeight: calculateTargetWeight(oneRMs.bench * 0.6, week, day, 'row'),
            },
          ]
        : [
            {
              name: 'Overhead Press',
              lift: 'ohp' as const,
              libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
              sets: 5,
              reps: isDeload ? 3 : 5,
              targetWeight: calculateTargetWeight(oneRMs.ohp, week, day, 'ohp'),
            },
            {
              name: 'Deadlift',
              lift: 'deadlift' as const,
              libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
              sets: 5,
              reps: isDeload ? 3 : 5,
              targetWeight: calculateTargetWeight(oneRMs.deadlift, week, day, 'deadlift'),
            },
          ]),
    ];
  },
  getAccessories: getMadcowAccessories,
  calculateTargetWeight,
  getSessionName: ({ week, day }) => {
    const weekData = WEEK_PERCENTAGES[week - 1];
    const isDeload = weekData.isDeload ?? false;
    return `Week ${week} - Workout ${day}${isDeload ? ' (Deload)' : ''}`;
  },
});

export default madcow;

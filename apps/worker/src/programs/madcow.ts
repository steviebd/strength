import { roundToPlate } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { madcowInfo, WEEK_PERCENTAGES, getMadcowAccessories } from './config/madcow';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

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

export function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];

  for (let week = 1; week <= 8; week++) {
    const weekData = WEEK_PERCENTAGES[week - 1];
    const isDeload = weekData.isDeload ?? false;

    for (let session = 1; session <= 3; session++) {
      const isDayA = session % 2 === 1;

      const exercises = [
        {
          name: 'Squat',
          lift: 'squat' as const,
          sets: 5,
          reps: isDeload ? 3 : 5,
          targetWeight: calculateTargetWeight(oneRMs.squat, week, session, 'squat'),
        },
        ...(isDayA
          ? [
              {
                name: 'Bench Press',
                lift: 'bench' as const,
                sets: 5,
                reps: isDeload ? 3 : 5,
                targetWeight: calculateTargetWeight(oneRMs.bench, week, session, 'bench'),
              },
              {
                name: 'Barbell Row',
                lift: 'row' as const,
                sets: 5,
                reps: isDeload ? 3 : 5,
                targetWeight: calculateTargetWeight(oneRMs.bench * 0.6, week, session, 'row'),
              },
            ]
          : [
              {
                name: 'Overhead Press',
                lift: 'ohp' as const,
                sets: 5,
                reps: isDeload ? 3 : 5,
                targetWeight: calculateTargetWeight(oneRMs.ohp, week, session, 'ohp'),
              },
              {
                name: 'Deadlift',
                lift: 'deadlift' as const,
                sets: 5,
                reps: isDeload ? 3 : 5,
                targetWeight: calculateTargetWeight(oneRMs.deadlift, week, session, 'deadlift'),
              },
            ]),
      ];

      workouts.push({
        weekNumber: week,
        sessionNumber: (week - 1) * 3 + session,
        sessionName: `Week ${week} - ${isDayA ? 'Day A' : 'Day B'}${isDeload ? ' (Deload)' : ''}`,
        exercises,
      });
    }
  }

  for (const workout of workouts) {
    const accessories = getMadcowAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const madcow: ProgramConfig = {
  info: madcowInfo,
  generateWorkouts,
  calculateTargetWeight,
};

export default madcow;

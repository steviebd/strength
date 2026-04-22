import { TRAINING_MAX_PERCENTAGE, roundToPlate } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { wendler531Info, WAVE_PERCENTAGES, getWendlerAccessories } from './config/wendler531';
import type { LiftType, OneRMValues, ProgramConfig, ProgramWorkout } from './types';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';

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

export function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];
  const lifts: Array<{ name: string; lift: LiftType; libraryId: string; oneRM: number }> = [
    {
      name: 'Squat',
      lift: 'squat' as const,
      libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
      oneRM: oneRMs.squat,
    },
    {
      name: 'Bench Press',
      lift: 'bench' as const,
      libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
      oneRM: oneRMs.bench,
    },
    {
      name: 'Deadlift',
      lift: 'deadlift' as const,
      libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
      oneRM: oneRMs.deadlift,
    },
    {
      name: 'Overhead Press',
      lift: 'ohp' as const,
      libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
      oneRM: oneRMs.ohp,
    },
  ];

  for (let cycle = 1; cycle <= 3; cycle++) {
    for (const week of [1, 2, 3, 4] as const) {
      const weekData = WAVE_PERCENTAGES[week];

      for (let day = 1; day <= 4; day++) {
        const lift = lifts[day - 1];

        const exercises = [
          {
            name: lift.name,
            lift: lift.lift,
            libraryId: lift.libraryId,
            sets: 3,
            reps: week === 4 ? 5 : weekData.reps[0],
            targetWeight: calculateTargetWeight(lift.oneRM, week, 1, lift.lift),
          },
          {
            name: lift.name,
            lift: lift.lift,
            libraryId: lift.libraryId,
            sets: 1,
            reps: week === 4 ? 5 : weekData.reps[1],
            targetWeight: calculateTargetWeight(lift.oneRM, week, 2, lift.lift),
          },
          {
            name: lift.name,
            lift: lift.lift,
            libraryId: lift.libraryId,
            sets: 1,
            reps: weekData.reps[2],
            targetWeight: calculateTargetWeight(lift.oneRM, week, 3, lift.lift),
          },
        ];

        const weekNumber = (cycle - 1) * 4 + week;

        workouts.push({
          weekNumber,
          sessionNumber: (cycle - 1) * 4 + day,
          sessionName: `Cycle ${cycle} - Week ${week} - ${lift.name}`,
          exercises,
        });
      }
    }
  }

  for (const workout of workouts) {
    const accessories = getWendlerAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const wendler531: ProgramConfig = {
  info: wendler531Info,
  generateWorkouts,
  calculateTargetWeight,
};

export default wendler531;

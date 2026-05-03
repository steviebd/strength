import { TRAINING_MAX_PERCENTAGE, roundToPlate, getDayLifts } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { nuckolsInfo, WAVE_1, WAVE_2, getNuckolsAccessories } from './config/nuckols';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  session: number,
  _lift: string,
  isT2 = false,
  waveNumber = 1,
): number {
  const trainingMax = estimatedOneRM * TRAINING_MAX_PERCENTAGE;
  const wave = waveNumber === 1 ? WAVE_1 : WAVE_2;
  const weekData = wave[`week${week}` as keyof typeof wave] || wave.week1;
  const percentages = isT2 ? weekData.t2 : weekData.t1;
  const setIndex = session - 1;
  const percentage = percentages[setIndex] || percentages[0];
  return roundToPlate(trainingMax * percentage);
}

function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];

  for (let wave = 1; wave <= 2; wave++) {
    for (let week = 1; week <= 4; week++) {
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
            sets: 3,
            reps: 8,
            targetWeight: calculateTargetWeight(t1OneRM, week, 1, config.t1, false, wave),
            isAmrap: false,
          },
          {
            name: `${liftName} 2`,
            lift: config.t1,
            libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
            sets: 3,
            reps: 8,
            targetWeight: calculateTargetWeight(t1OneRM, week, 2, config.t1, false, wave),
            isAmrap: false,
          },
          {
            name: `${liftName} 3`,
            lift: config.t1,
            libraryId: LIFT_TYPE_LIBRARY_ID[config.t1],
            sets: 3,
            reps: 8,
            targetWeight: calculateTargetWeight(t1OneRM, week, 3, config.t1, false, wave),
            isAmrap: false,
          },
        ];

        const t2Sets = [
          {
            name: t2LiftName,
            lift: config.t2,
            libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
            sets: 3,
            reps: 10,
            targetWeight: calculateTargetWeight(t2OneRM, week, 1, config.t2, true, wave),
            isAmrap: false,
          },
          {
            name: `${t2LiftName} 2`,
            lift: config.t2,
            libraryId: LIFT_TYPE_LIBRARY_ID[config.t2],
            sets: 3,
            reps: 10,
            targetWeight: calculateTargetWeight(t2OneRM, week, 2, config.t2, true, wave),
            isAmrap: false,
          },
        ];

        workouts.push({
          weekNumber: (wave - 1) * 4 + week,
          sessionNumber: ((wave - 1) * 4 + week - 1) * 4 + day,
          sessionName: `Week ${(wave - 1) * 4 + week} - Workout ${day}`,
          exercises: [...t1Sets, ...t2Sets],
        });
      }
    }
  }

  for (const workout of workouts) {
    const accessories = getNuckolsAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const nuckols: ProgramConfig = {
  info: nuckolsInfo,
  generateWorkouts,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, false, 1),
};

export default nuckols;

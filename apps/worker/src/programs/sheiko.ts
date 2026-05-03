import { roundToPlate } from './utils';
import { generateWorkoutAccessories } from './accessory-data';
import { sheikoInfo, VOLUME_DAY, INTENSITY_DAY, getSheikoAccessories } from './config/sheiko';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import type { OneRMValues, ProgramConfig, ProgramWorkout } from './types';

function calculateTargetWeight(
  estimatedOneRM: number,
  week: number,
  _session: number,
  lift: string,
  isVolume = true,
): number {
  const config = isVolume ? VOLUME_DAY : INTENSITY_DAY;
  const liftConfig = config[lift as keyof typeof config];

  const weekModifiers: Record<number, number> = {
    1: 0.9,
    2: 0.925,
    3: 0.95,
    4: 0.975,
    5: 0.85,
    6: 0.875,
    7: 0.9,
    8: 0.7,
  };

  const modifier = weekModifiers[week] || 0.9;
  const percentage = liftConfig.percentage * modifier;
  return roundToPlate(estimatedOneRM * percentage);
}

function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];

  for (let week = 1; week <= 8; week++) {
    const isVolumeWeek = week % 2 === 1;
    const isDeload = week === 8;

    const weekConfig = isVolumeWeek ? VOLUME_DAY : INTENSITY_DAY;

    workouts.push({
      weekNumber: week,
      sessionNumber: (week - 1) * 4 + 1,
      sessionName: `Week ${week} - Workout 1${isDeload ? ' (Deload)' : ''}`,
      exercises: [
        {
          name: 'Squat',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: isDeload ? 3 : weekConfig.squat.sets,
          reps: isDeload ? 2 : weekConfig.squat.reps,
          targetWeight: calculateTargetWeight(oneRMs.squat, week, 1, 'squat', isVolumeWeek),
        },
        {
          name: 'Bench Press',
          lift: 'bench' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
          sets: isDeload ? 2 : weekConfig.bench.sets,
          reps: isDeload ? 3 : weekConfig.bench.reps,
          targetWeight: calculateTargetWeight(oneRMs.bench, week, 1, 'bench', isVolumeWeek),
        },
      ],
    });

    workouts.push({
      weekNumber: week,
      sessionNumber: (week - 1) * 4 + 2,
      sessionName: `Week ${week} - Workout 2${isDeload ? ' (Deload)' : ''}`,
      exercises: [
        {
          name: 'Deadlift',
          lift: 'deadlift' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
          sets: isDeload ? 2 : weekConfig.deadlift.sets,
          reps: isDeload ? 2 : weekConfig.deadlift.reps,
          targetWeight: calculateTargetWeight(oneRMs.deadlift, week, 1, 'deadlift', isVolumeWeek),
        },
        {
          name: 'Overhead Press',
          lift: 'ohp' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
          sets: isDeload ? 2 : weekConfig.ohp.sets,
          reps: isDeload ? 3 : weekConfig.ohp.reps,
          targetWeight: calculateTargetWeight(oneRMs.ohp, week, 1, 'ohp', isVolumeWeek),
        },
      ],
    });

    workouts.push({
      weekNumber: week,
      sessionNumber: (week - 1) * 4 + 3,
      sessionName: `Week ${week} - Workout 3${isDeload ? ' (Deload)' : ''}`,
      exercises: [
        {
          name: 'Squat',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: isDeload ? 3 : weekConfig.squat.sets - 1,
          reps: isDeload ? 2 : weekConfig.squat.reps,
          targetWeight: calculateTargetWeight(oneRMs.squat, week, 2, 'squat', isVolumeWeek),
        },
        {
          name: 'Bench Press',
          lift: 'bench' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
          sets: isDeload ? 2 : weekConfig.bench.sets - 1,
          reps: isDeload ? 3 : weekConfig.bench.reps,
          targetWeight: calculateTargetWeight(oneRMs.bench, week, 2, 'bench', isVolumeWeek),
        },
      ],
    });

    workouts.push({
      weekNumber: week,
      sessionNumber: (week - 1) * 4 + 4,
      sessionName: `Week ${week} - Workout 4${isDeload ? ' (Deload)' : ''}`,
      exercises: [
        {
          name: 'Deadlift',
          lift: 'deadlift' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
          sets: isDeload ? 2 : weekConfig.deadlift.sets - 1,
          reps: isDeload ? 2 : weekConfig.deadlift.reps,
          targetWeight: calculateTargetWeight(oneRMs.deadlift, week, 2, 'deadlift', isVolumeWeek),
        },
        {
          name: 'Overhead Press',
          lift: 'ohp' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
          sets: isDeload ? 2 : weekConfig.ohp.sets - 1,
          reps: isDeload ? 3 : weekConfig.ohp.reps,
          targetWeight: calculateTargetWeight(oneRMs.ohp, week, 2, 'ohp', isVolumeWeek),
        },
      ],
    });
  }

  for (const workout of workouts) {
    const accessories = getSheikoAccessories(workout.weekNumber, workout.sessionNumber);
    if (accessories.length > 0) {
      workout.accessories = generateWorkoutAccessories(accessories, oneRMs);
    }
  }

  return workouts;
}

export const sheiko: ProgramConfig = {
  info: sheikoInfo,
  generateWorkouts,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, true),
};

export default sheiko;

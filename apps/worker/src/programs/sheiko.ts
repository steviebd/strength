import { roundToPlate } from './utils';
import { sheikoInfo, VOLUME_DAY, INTENSITY_DAY, getSheikoAccessories } from './config/sheiko';
import { LIFT_TYPE_LIBRARY_ID } from '@strength/db/exercise-library';
import { createLinearProgramGenerator } from './factory';

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

export const sheiko = createLinearProgramGenerator({
  info: sheikoInfo,
  weeks: 8,
  daysPerWeek: 4,
  buildExercises: ({ week, day, oneRMs }) => {
    const isVolumeWeek = week % 2 === 1;
    const isDeload = week === 8;
    const weekConfig = isVolumeWeek ? VOLUME_DAY : INTENSITY_DAY;

    if (day === 1) {
      return [
        {
          name: 'Squat',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: isDeload ? 3 : weekConfig.squat.sets,
          reps: isDeload ? 2 : weekConfig.squat.reps,
          targetWeight: calculateTargetWeight(oneRMs.squat, week, 1, 'squat', isVolumeWeek),
        },
        {
          name: 'Bench Press',
          exerciseType: 'weighted',
          lift: 'bench' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
          sets: isDeload ? 2 : weekConfig.bench.sets,
          reps: isDeload ? 3 : weekConfig.bench.reps,
          targetWeight: calculateTargetWeight(oneRMs.bench, week, 1, 'bench', isVolumeWeek),
        },
      ];
    }

    if (day === 2) {
      return [
        {
          name: 'Deadlift',
          exerciseType: 'weighted',
          lift: 'deadlift' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
          sets: isDeload ? 2 : weekConfig.deadlift.sets,
          reps: isDeload ? 2 : weekConfig.deadlift.reps,
          targetWeight: calculateTargetWeight(oneRMs.deadlift, week, 1, 'deadlift', isVolumeWeek),
        },
        {
          name: 'Overhead Press',
          exerciseType: 'weighted',
          lift: 'ohp' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
          sets: isDeload ? 2 : weekConfig.ohp.sets,
          reps: isDeload ? 3 : weekConfig.ohp.reps,
          targetWeight: calculateTargetWeight(oneRMs.ohp, week, 1, 'ohp', isVolumeWeek),
        },
      ];
    }

    if (day === 3) {
      return [
        {
          name: 'Squat',
          exerciseType: 'weighted',
          lift: 'squat' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['squat'],
          sets: isDeload ? 3 : weekConfig.squat.sets - 1,
          reps: isDeload ? 2 : weekConfig.squat.reps,
          targetWeight: calculateTargetWeight(oneRMs.squat, week, 2, 'squat', isVolumeWeek),
        },
        {
          name: 'Bench Press',
          exerciseType: 'weighted',
          lift: 'bench' as const,
          libraryId: LIFT_TYPE_LIBRARY_ID['bench'],
          sets: isDeload ? 2 : weekConfig.bench.sets - 1,
          reps: isDeload ? 3 : weekConfig.bench.reps,
          targetWeight: calculateTargetWeight(oneRMs.bench, week, 2, 'bench', isVolumeWeek),
        },
      ];
    }

    return [
      {
        name: 'Deadlift',
        exerciseType: 'weighted',
        lift: 'deadlift' as const,
        libraryId: LIFT_TYPE_LIBRARY_ID['deadlift'],
        sets: isDeload ? 2 : weekConfig.deadlift.sets - 1,
        reps: isDeload ? 2 : weekConfig.deadlift.reps,
        targetWeight: calculateTargetWeight(oneRMs.deadlift, week, 2, 'deadlift', isVolumeWeek),
      },
      {
        name: 'Overhead Press',
        exerciseType: 'weighted',
        lift: 'ohp' as const,
        libraryId: LIFT_TYPE_LIBRARY_ID['ohp'],
        sets: isDeload ? 2 : weekConfig.ohp.sets - 1,
        reps: isDeload ? 3 : weekConfig.ohp.reps,
        targetWeight: calculateTargetWeight(oneRMs.ohp, week, 2, 'ohp', isVolumeWeek),
      },
    ];
  },
  getAccessories: getSheikoAccessories,
  calculateTargetWeight: (oneRM, week, session, lift) =>
    calculateTargetWeight(oneRM, week, session, lift, true),
  getSessionName: ({ week, day }) => {
    const isDeload = week === 8;
    return `Week ${week} - Workout ${day}${isDeload ? ' (Deload)' : ''}`;
  },
});

export default sheiko;

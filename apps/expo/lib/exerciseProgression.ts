export type ExerciseProgressionType = 'weight' | 'reps' | 'time';

export function getProgressionType(exerciseType?: string | null): ExerciseProgressionType {
  if (exerciseType === 'timed' || exerciseType === 'cardio') return 'time';
  if (exerciseType === 'bodyweight' || exerciseType === 'plyo') return 'reps';
  return 'weight';
}

export function getDefaultProgressionIncrement(
  exerciseType?: string | null,
  weightUnit: 'kg' | 'lbs' = 'kg',
) {
  const progressionType = getProgressionType(exerciseType);
  if (progressionType === 'time') return '30';
  if (progressionType === 'reps') return '1';
  return weightUnit === 'lbs' ? '5' : '2.5';
}

export function getProgressionLabels(
  exerciseType?: string | null,
  weightUnit: 'kg' | 'lbs' = 'kg',
) {
  const progressionType = getProgressionType(exerciseType);
  if (progressionType === 'time') {
    return {
      start: 'Start (sec)',
      increment: 'Inc (sec)',
      description: 'time',
    };
  }
  if (progressionType === 'reps') {
    return {
      start: 'Start Reps',
      increment: 'Inc Reps',
      description: 'reps',
    };
  }
  return {
    start: `Start (${weightUnit})`,
    increment: `Inc (${weightUnit})`,
    description: weightUnit,
  };
}

export function getDefaultExerciseTargets(exerciseType?: string | null) {
  switch (exerciseType) {
    case 'timed':
      return { sets: '1', reps: '', weight: '', duration: '60', distance: '', height: '' };
    case 'cardio':
      return { sets: '1', reps: '', weight: '', duration: '600', distance: '1000', height: '' };
    case 'bodyweight':
      return { sets: '3', reps: '8', weight: '', duration: '', distance: '', height: '' };
    case 'plyo':
      return { sets: '3', reps: '8', weight: '', duration: '', distance: '', height: '30' };
    case 'weighted':
    default:
      return { sets: '3', reps: '8', weight: '', duration: '', distance: '', height: '' };
  }
}

export function incrementHistorySet<
  T extends {
    weight: number | null;
    reps: number | null;
    duration?: number | null;
  },
>(set: T, exerciseType?: string | null): T {
  const progressionType = getProgressionType(exerciseType);
  if (progressionType === 'time' && set.duration !== null && set.duration !== undefined) {
    return { ...set, duration: set.duration + 30 };
  }
  if (progressionType === 'reps' && set.reps !== null) {
    return { ...set, reps: set.reps + 1 };
  }
  if (set.weight !== null) {
    return { ...set, weight: set.weight + 2.5 };
  }
  return set;
}

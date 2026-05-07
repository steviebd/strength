export interface PlannedSetInput {
  exerciseType?: string | null;
  targetWeight?: number | null;
  addedWeight?: number | null;
  reps?: number | null;
  isAmrap?: boolean | null;
  targetDuration?: number | null;
  targetDistance?: number | null;
  targetHeight?: number | null;
}

export interface PlannedSetValues {
  weight: number | null;
  reps: number | null;
  duration: number | null;
  distance: number | null;
  height: number | null;
}

export function computePlannedSetValues(input: PlannedSetInput): PlannedSetValues {
  const type = input.exerciseType ?? 'weights';
  const isAmrap = input.isAmrap ?? false;
  const isRepsNotApplicable = isAmrap || type === 'timed' || type === 'cardio';

  return {
    weight:
      type === 'weights'
        ? (input.targetWeight ?? 0) + (input.addedWeight ?? 0)
        : type === 'bodyweight' && ((input.targetWeight ?? 0) > 0 || (input.addedWeight ?? 0) > 0)
          ? (input.targetWeight ?? 0) + (input.addedWeight ?? 0)
          : null,
    reps: isRepsNotApplicable ? null : (input.reps ?? null),
    duration: type === 'timed' || type === 'cardio' ? (input.targetDuration ?? 0) : null,
    distance: type === 'cardio' ? (input.targetDistance ?? null) : null,
    height: type === 'plyo' ? (input.targetHeight ?? 0) : null,
  };
}

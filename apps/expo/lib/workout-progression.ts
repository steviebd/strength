import type { ExerciseHistorySnapshot } from '@/db/workouts';
import { formatDistance, formatDuration, type DistanceUnit } from './units';

export type WeightUnit = 'kg' | 'lbs';
export type ProgressionMode = 'progress' | 'use_last' | 'empty' | 'custom' | null;

export type ProgressionHistorySet = ExerciseHistorySnapshot['sets'][number];

export type ProgressionSelection = {
  exerciseId: string;
  mode: ProgressionMode;
  increment: number;
};

export function getDefaultProgressionIncrement(weightUnit: WeightUnit) {
  return weightUnit === 'lbs' ? 5 : 2.5;
}

export function canProgressExerciseType(exerciseType: string | null | undefined) {
  return exerciseType === 'weights' || exerciseType === 'bodyweight';
}

export type ProgressionDefaults = {
  defaultWeightIncrement?: number | null;
  defaultBodyweightIncrement?: number | null;
  defaultCardioIncrement?: number | null;
  defaultTimedIncrement?: number | null;
  defaultPlyoIncrement?: number | null;
};

function resolveIncrement(override: number | null | undefined, fallback: number): number {
  if (typeof override === 'number' && !Number.isNaN(override) && override > 0) return override;
  return fallback;
}

export function getDefaultProgressionForExercise(
  exerciseType: string | null | undefined,
  hasWeight: boolean,
  weightUnit: WeightUnit,
  overrides?: ProgressionDefaults,
): { increment: number; deltaLabel: string } {
  const type = exerciseType ?? 'weights';
  if (type === 'weights' || (type === 'bodyweight' && hasWeight)) {
    const increment = resolveIncrement(
      overrides?.defaultWeightIncrement,
      getDefaultProgressionIncrement(weightUnit),
    );
    return { increment, deltaLabel: `+${increment} ${weightUnit}` };
  }
  if (type === 'bodyweight') {
    const increment = resolveIncrement(overrides?.defaultBodyweightIncrement, 2);
    return { increment, deltaLabel: `+${increment} reps` };
  }
  if (type === 'cardio') {
    const increment = resolveIncrement(overrides?.defaultCardioIncrement, 60);
    const mins = Math.floor(increment / 60);
    const secs = increment % 60;
    if (mins > 0 && secs > 0)
      return { increment, deltaLabel: `+${mins}:${secs.toString().padStart(2, '0')} min` };
    if (mins > 0) return { increment, deltaLabel: `+${mins}:00 min` };
    return { increment, deltaLabel: `+${secs} sec` };
  }
  if (type === 'timed') {
    const increment = resolveIncrement(overrides?.defaultTimedIncrement, 5);
    return { increment, deltaLabel: `+${increment} sec` };
  }
  if (type === 'plyo') {
    const increment = resolveIncrement(overrides?.defaultPlyoIncrement, 1);
    return { increment, deltaLabel: `+${increment} rep${increment === 1 ? '' : 's'}` };
  }
  // Fallback for unknown types
  return { increment: 0, deltaLabel: '' };
}

export function hasWeightInSets(sets: Array<{ weight: number | null }>) {
  return sets.some((s) => s.weight !== null && s.weight > 0);
}

export function hasProgressionHistoryData(
  snapshot: { sets?: ProgressionHistorySet[] | null } | null | undefined,
) {
  return (
    snapshot?.sets?.some(
      (set) =>
        set.weight !== null ||
        set.reps !== null ||
        set.duration !== null ||
        set.distance !== null ||
        set.height !== null,
    ) ?? false
  );
}

function formatDurationIncrement(seconds: number): string {
  const formatted = formatDuration(seconds);
  return formatted.includes(':') ? `${formatted} min` : formatted;
}

export function getLastWorkoutSummary(
  sets: Array<ProgressionHistorySet>,
  exerciseType: string | null | undefined,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
): string {
  const type = exerciseType ?? 'weights';
  const hasWeight = hasWeightInSets(sets);

  if ((type === 'weights' || type === 'bodyweight') && hasWeight) {
    // Pick highest weight set (break ties by reps)
    const best = sets.reduce((bestSet, current) => {
      const cw = current.weight ?? 0;
      const bw = bestSet.weight ?? 0;
      if (cw > bw) return current;
      if (cw === bw && (current.reps ?? 0) > (bestSet.reps ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return 'No data';
    const parts: string[] = [];
    if (best.weight !== null) parts.push(`${best.weight} ${weightUnit}`);
    if (best.reps !== null) parts.push(`${best.reps} reps`);
    return parts.length > 0 ? parts.join(' × ') : 'No data';
  }

  if (type === 'bodyweight' || type === 'plyo') {
    const best = sets.reduce((bestSet, current) => {
      if ((current.reps ?? 0) > (bestSet.reps ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return 'No data';
    return best.reps !== null ? `${best.reps} rep${best.reps === 1 ? '' : 's'}` : 'No data';
  }

  if (type === 'cardio') {
    const best = sets.reduce((bestSet, current) => {
      if ((current.duration ?? 0) > (bestSet.duration ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return 'No data';
    const parts: string[] = [];
    if (best.duration !== null && best.duration > 0) parts.push(formatDuration(best.duration));
    if (best.distance !== null && best.distance > 0)
      parts.push(formatDistance(best.distance, distanceUnit));
    return parts.length > 0 ? parts.join(' • ') : 'No data';
  }

  if (type === 'timed') {
    const best = sets.reduce((bestSet, current) => {
      if ((current.duration ?? 0) > (bestSet.duration ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return 'No data';
    return best.duration !== null && best.duration > 0 ? formatDuration(best.duration) : 'No data';
  }

  return 'No data';
}

export function getSuggestedSummary(
  sets: Array<ProgressionHistorySet>,
  exerciseType: string | null | undefined,
  increment: number,
  weightUnit: WeightUnit,
  distanceUnit: DistanceUnit,
): { summary: string; delta: string } {
  const type = exerciseType ?? 'weights';
  const hasWeight = hasWeightInSets(sets);

  if ((type === 'weights' || type === 'bodyweight') && hasWeight) {
    const best = sets.reduce((bestSet, current) => {
      const cw = current.weight ?? 0;
      const bw = bestSet.weight ?? 0;
      if (cw > bw) return current;
      if (cw === bw && (current.reps ?? 0) > (bestSet.reps ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return { summary: 'No data', delta: '' };
    const parts: string[] = [];
    if (best.weight !== null) parts.push(`${best.weight + increment} ${weightUnit}`);
    if (best.reps !== null) parts.push(`${best.reps} reps`);
    const summary = parts.length > 0 ? parts.join(' × ') : 'No data';
    return { summary, delta: `+${increment} ${weightUnit}` };
  }

  if (type === 'bodyweight' || type === 'plyo') {
    const best = sets.reduce((bestSet, current) => {
      if ((current.reps ?? 0) > (bestSet.reps ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return { summary: 'No data', delta: '' };
    const reps = (best.reps ?? 0) + increment;
    const summary = reps > 0 ? `${reps} rep${reps === 1 ? '' : 's'}` : 'No data';
    const deltaLabel = type === 'bodyweight' ? `+${increment} reps` : `+${increment} rep`;
    return { summary, delta: deltaLabel };
  }

  if (type === 'cardio') {
    const best = sets.reduce((bestSet, current) => {
      if ((current.duration ?? 0) > (bestSet.duration ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return { summary: 'No data', delta: '' };
    const parts: string[] = [];
    if (best.duration !== null && best.duration > 0)
      parts.push(formatDuration(best.duration + increment));
    if (best.distance !== null && best.distance > 0)
      parts.push(formatDistance(best.distance, distanceUnit));
    const summary = parts.length > 0 ? parts.join(' • ') : 'No data';
    return { summary, delta: `+${formatDurationIncrement(increment)}` };
  }

  if (type === 'timed') {
    const best = sets.reduce((bestSet, current) => {
      if ((current.duration ?? 0) > (bestSet.duration ?? 0)) return current;
      return bestSet;
    }, sets[0]);
    if (!best) return { summary: 'No data', delta: '' };
    const dur = best.duration !== null && best.duration > 0 ? best.duration + increment : 0;
    const summary = dur > 0 ? formatDuration(dur) : 'No data';
    return { summary, delta: `+${increment} sec` };
  }

  return { summary: 'No data', delta: '' };
}

export function applyProgressionToHistorySet<T extends ProgressionHistorySet>(
  set: T,
  increment: number,
  exerciseType: string | null | undefined,
): T {
  const type = exerciseType ?? 'weights';
  const hasWeight = set.weight !== null && set.weight > 0;

  if ((type === 'weights' || type === 'bodyweight') && hasWeight) {
    return { ...set, weight: (set.weight ?? 0) + increment };
  }

  if (type === 'bodyweight' || type === 'plyo') {
    return { ...set, reps: (set.reps ?? 0) + increment };
  }

  if (type === 'cardio' || type === 'timed') {
    return { ...set, duration: (set.duration ?? 0) + increment };
  }

  return { ...set };
}

export function buildProgressedHistorySnapshot(
  snapshot: ExerciseHistorySnapshot,
  increment: number,
  exerciseType: string | null | undefined,
): ExerciseHistorySnapshot {
  return {
    ...snapshot,
    sets: snapshot.sets.map((set) => applyProgressionToHistorySet(set, increment, exerciseType)),
  };
}

export function buildHistorySnapshotFromSelection(
  snapshot: ExerciseHistorySnapshot,
  selection: ProgressionSelection | undefined,
  exerciseType: string | null | undefined,
) {
  if (!selection || selection.mode === 'empty') return null;
  if (selection.mode === 'use_last') return snapshot;
  // null or 'progress' or 'custom' all apply progression
  return buildProgressedHistorySnapshot(snapshot, selection.increment, exerciseType);
}

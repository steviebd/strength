export type SerializedProgramTargetLift = {
  name?: unknown;
  lift?: unknown;
  accessoryId?: unknown;
  targetWeight?: unknown;
  addedWeight?: unknown;
  sets?: unknown;
  reps?: unknown;
  isAccessory?: unknown;
  isRequired?: unknown;
  isAmrap?: unknown;
  libraryId?: unknown;
  exerciseId?: unknown;
  exerciseType?: unknown;
  targetDuration?: unknown;
  targetDistance?: unknown;
  targetHeight?: unknown;
};

export type NormalizedProgramTargetLift = {
  name: string;
  lift?: string;
  accessoryId?: string;
  targetWeight: number | null;
  addedWeight: number;
  sets: number;
  reps: number | string | null;
  isAccessory: boolean;
  isRequired: boolean;
  isAmrap: boolean;
  libraryId?: string;
  exerciseId?: string;
  exerciseType: string;
  targetDuration: number | null;
  targetDistance: number | null;
  targetHeight: number | null;
};

export function normalizeProgramSetCount(value: unknown, fallback = 1) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

export function normalizeProgramReps(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

export function isProgramAmrap(targetLift: { name?: unknown; reps?: unknown; isAmrap?: unknown }) {
  if (targetLift.isAmrap === true) {
    return true;
  }
  if (typeof targetLift.reps === 'string' && targetLift.reps.trim().toUpperCase() === 'AMRAP') {
    return true;
  }
  return typeof targetLift.name === 'string' && /\d+\+$/.test(targetLift.name.trim());
}

export function normalizeProgramTargetLift(
  targetLift: SerializedProgramTargetLift,
  defaults?: { isAccessory?: boolean; isRequired?: boolean },
): NormalizedProgramTargetLift | null {
  if (typeof targetLift.name !== 'string' || targetLift.name.trim().length === 0) {
    return null;
  }

  const isAccessory =
    typeof targetLift.isAccessory === 'boolean'
      ? targetLift.isAccessory
      : (defaults?.isAccessory ?? false);
  const isRequired =
    typeof targetLift.isRequired === 'boolean'
      ? targetLift.isRequired
      : (defaults?.isRequired ?? true);
  const isAmrap = isProgramAmrap(targetLift);

  return {
    name: targetLift.name,
    lift: typeof targetLift.lift === 'string' ? targetLift.lift : undefined,
    accessoryId: typeof targetLift.accessoryId === 'string' ? targetLift.accessoryId : undefined,
    targetWeight:
      typeof targetLift.targetWeight === 'number' && Number.isFinite(targetLift.targetWeight)
        ? targetLift.targetWeight
        : null,
    addedWeight:
      typeof targetLift.addedWeight === 'number' && Number.isFinite(targetLift.addedWeight)
        ? targetLift.addedWeight
        : 0,
    sets: normalizeProgramSetCount(targetLift.sets, 1),
    reps:
      typeof targetLift.reps === 'number' || typeof targetLift.reps === 'string'
        ? targetLift.reps
        : null,
    isAccessory,
    isRequired,
    isAmrap,
    libraryId: typeof targetLift.libraryId === 'string' ? targetLift.libraryId : undefined,
    exerciseId: typeof targetLift.exerciseId === 'string' ? targetLift.exerciseId : undefined,
    exerciseType: typeof targetLift.exerciseType === 'string' ? targetLift.exerciseType : 'weights',
    targetDuration:
      typeof targetLift.targetDuration === 'number' && Number.isFinite(targetLift.targetDuration)
        ? targetLift.targetDuration
        : null,
    targetDistance:
      typeof targetLift.targetDistance === 'number' && Number.isFinite(targetLift.targetDistance)
        ? targetLift.targetDistance
        : null,
    targetHeight:
      typeof targetLift.targetHeight === 'number' && Number.isFinite(targetLift.targetHeight)
        ? targetLift.targetHeight
        : null,
  };
}

export function parseProgramTargetLifts(targetLifts: string | null | undefined) {
  if (!targetLifts) {
    return {
      exercises: [] as NormalizedProgramTargetLift[],
      accessories: [] as NormalizedProgramTargetLift[],
      all: [] as NormalizedProgramTargetLift[],
    };
  }

  try {
    const parsed = JSON.parse(targetLifts);
    const exercises: NormalizedProgramTargetLift[] = [];
    const accessories: NormalizedProgramTargetLift[] = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const normalized = normalizeProgramTargetLift(item ?? {});
        if (!normalized) continue;
        if (normalized.isAccessory) {
          accessories.push(normalized);
        } else {
          exercises.push(normalized);
        }
      }
    } else if (parsed && typeof parsed === 'object') {
      const record = parsed as {
        exercises?: SerializedProgramTargetLift[];
        accessories?: SerializedProgramTargetLift[];
      };

      for (const item of record.exercises ?? []) {
        const normalized = normalizeProgramTargetLift(item ?? {}, { isAccessory: false });
        if (normalized) exercises.push(normalized);
      }

      for (const item of record.accessories ?? []) {
        const normalized = normalizeProgramTargetLift(item ?? {}, {
          isAccessory: true,
          isRequired: false,
        });
        if (normalized) accessories.push(normalized);
      }
    }

    return { exercises, accessories, all: [...exercises, ...accessories] };
  } catch {
    return {
      exercises: [] as NormalizedProgramTargetLift[],
      accessories: [] as NormalizedProgramTargetLift[],
      all: [] as NormalizedProgramTargetLift[],
    };
  }
}

export function getProgramTargetLiftKey(targetLift: NormalizedProgramTargetLift): string {
  const baseKey =
    targetLift.libraryId ?? targetLift.exerciseId ?? targetLift.accessoryId ?? targetLift.lift;

  if (baseKey) {
    return baseKey;
  }

  return targetLift.name
    .trim()
    .toLowerCase()
    .replace(/\s+\d+\+?$/, '');
}

export function consolidateProgramTargetLifts(targetLifts: NormalizedProgramTargetLift[]) {
  return consolidateProgramTargetLiftsByKey(targetLifts, getProgramTargetLiftKey);
}

function consolidateProgramTargetLiftsByKey(
  targetLifts: NormalizedProgramTargetLift[],
  getKey: (targetLift: NormalizedProgramTargetLift) => string,
) {
  const grouped = new Map<
    string,
    NormalizedProgramTargetLift & { segments: NormalizedProgramTargetLift[] }
  >();

  for (const targetLift of targetLifts) {
    const key = getKey(targetLift);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...targetLift,
        segments: [targetLift],
      });
      continue;
    }

    existing.sets += targetLift.sets;
    existing.isAmrap = existing.isAmrap || targetLift.isAmrap;
    existing.isRequired = existing.isRequired || targetLift.isRequired;
    existing.segments.push(targetLift);
  }

  return Array.from(grouped.values());
}

export function consolidateProgramTargetLiftsForWorkoutSections(
  targetLifts: NormalizedProgramTargetLift[],
) {
  return consolidateProgramTargetLiftsByKey(
    targetLifts,
    (targetLift) =>
      `${getProgramTargetLiftKey(targetLift)}:${targetLift.isAmrap ? 'amrap' : 'normal'}`,
  );
}

export type GroupedExercise = {
  name: string;
  count: number;
  libraryId?: string;
  lift?: string;
};

export function groupConsecutiveExercises(
  items: Array<{ name: string; libraryId?: string; lift?: string }>,
): GroupedExercise[] {
  const grouped: GroupedExercise[] = [];
  for (const item of items) {
    const key = item.libraryId ?? item.lift ?? item.name;
    const last = grouped[grouped.length - 1];
    const lastKey = last ? (last.libraryId ?? last.lift ?? last.name) : null;
    if (last && lastKey === key) {
      last.count++;
    } else {
      grouped.push({ name: item.name, count: 1, libraryId: item.libraryId, lift: item.lift });
    }
  }
  return grouped;
}

export function getCurrentCycleWorkout<
  T extends {
    id: string;
    weekNumber: number;
    sessionNumber: number;
    isComplete?: boolean | null;
  },
>(cycle: { currentWeek: number | null; currentSession: number | null }, workouts: T[]) {
  return (
    workouts.find(
      (workout) =>
        workout.weekNumber === cycle.currentWeek && workout.sessionNumber === cycle.currentSession,
    ) ??
    workouts.find((workout) => !workout.isComplete) ??
    null
  );
}

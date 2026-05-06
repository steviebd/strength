import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import {
  WORKOUT_TYPE_ONE_RM_TEST,
  WORKOUT_TYPE_TRAINING,
  consolidateProgramTargetLifts,
  getCurrentCycleWorkout,
  generateId,
  normalizeProgramReps,
  parseProgramTargetLifts,
} from '@strength/db/client';
import { getLocalDb, withLocalTransaction } from './client';
import {
  localProgramCycleWorkouts,
  localProgramCycles,
  localTemplateExercises,
  localTemplates,
  localUserExercises,
  localWorkoutExercises,
  localWorkouts,
  localWorkoutSets,
  type LocalWorkout,
  type LocalWorkoutSet,
} from './local-schema';
import { enqueueSyncItem } from './sync-queue';
import { removePendingWorkout } from '../lib/storage';
import type { Workout, WorkoutExercise, WorkoutSet } from '@/context/WorkoutSessionContext';

type WorkoutType = 'training' | 'one_rm_test';

export type WorkoutSyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';

export interface LocalWorkoutHistoryItem {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  totalVolume: number | null;
  totalSets: number | null;
  exerciseCount: number;
  syncStatus: WorkoutSyncStatus;
  lastSyncError: string | null;
}

type LocalExerciseInput = {
  id?: string;
  exerciseId: string;
  libraryId?: string | null;
  name: string;
  muscleGroup?: string | null;
  exerciseType?: string | null;
  orderIndex: number;
  notes?: string | null;
  isAmrap?: boolean;
  sets: Array<{
    id?: string;
    setNumber: number;
    weight?: number | null;
    reps?: number | null;
    rpe?: number | null;
    duration?: number | null;
    distance?: number | null;
    height?: number | null;
    isComplete?: boolean;
    completedAt?: Date | string | null;
  }>;
};

type ProgramCycleWorkoutDefinition = {
  id: string;
  cycleId: string;
  templateId?: string | null;
  weekNumber?: number | null;
  sessionNumber?: number | null;
  sessionName: string;
  targetLifts?: string | null;
  isComplete?: boolean | null;
  workoutId?: string | null;
  scheduledAt?: Date | string | number | null;
};

export type ExerciseHistorySnapshot = {
  exerciseId: string;
  workoutDate: string | null;
  sets: Array<{
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    duration: number | null;
    distance: number | null;
    height: number | null;
    setNumber?: number | null;
  }>;
};

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function normalizeExerciseName(name: string | null | undefined) {
  return name?.trim().toLowerCase() || null;
}

function toDate(value: Date | string | number | null | undefined) {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string | number | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function isZeroUuid(id: string | null | undefined) {
  return id === '00000000-0000-4000-8000-000000000000';
}

function resolveWorkoutType(input: { workoutType?: string | null; name?: string | null }) {
  if (input.workoutType === WORKOUT_TYPE_ONE_RM_TEST) {
    return WORKOUT_TYPE_ONE_RM_TEST;
  }
  if (input.name === '1RM Test') {
    return WORKOUT_TYPE_ONE_RM_TEST;
  }
  return WORKOUT_TYPE_TRAINING;
}

function buildPlannedSetValues(input: {
  exerciseType?: string | null;
  targetWeight?: number | null;
  addedWeight?: number | null;
  reps?: number | null;
  isAmrap?: boolean | null;
  targetDuration?: number | null;
  targetDistance?: number | null;
  targetHeight?: number | null;
}) {
  const type = input.exerciseType ?? 'weighted';
  return {
    weight:
      type === 'weighted'
        ? (input.targetWeight ?? 0) + (input.addedWeight ?? 0)
        : type === 'bodyweight' && ((input.targetWeight ?? 0) > 0 || (input.addedWeight ?? 0) > 0)
          ? (input.targetWeight ?? 0) + (input.addedWeight ?? 0)
          : null,
    reps: input.isAmrap || type === 'timed' || type === 'cardio' ? null : (input.reps ?? 10),
    duration: type === 'timed' || type === 'cardio' ? (input.targetDuration ?? 0) : null,
    distance: type === 'cardio' ? (input.targetDistance ?? null) : null,
    height: type === 'plyo' ? (input.targetHeight ?? 0) : null,
  };
}

function generateUniqueId(usedIds: Set<string>, requestedId?: string | null) {
  let id =
    requestedId && !isZeroUuid(requestedId) && !usedIds.has(requestedId)
      ? requestedId
      : generateId();
  let attempts = 0;
  while (isZeroUuid(id) || usedIds.has(id)) {
    attempts++;
    id = attempts > 10 ? `${generateId()}-${attempts}` : generateId();
  }
  usedIds.add(id);
  return id;
}

function asWorkoutSet(row: LocalWorkoutSet): WorkoutSet {
  return {
    id: row.id,
    workoutExerciseId: row.workoutExerciseId,
    setNumber: row.setNumber,
    weight: row.weight ?? null,
    reps: row.reps ?? null,
    duration: row.duration ?? null,
    distance: row.distance ?? null,
    height: row.height ?? null,
    rpe: row.rpe ?? null,
    isComplete: Boolean(row.isComplete),
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt),
  };
}

function asWorkout(row: LocalWorkout, exercises: WorkoutExercise[]): Workout {
  return {
    id: row.id,
    name: row.name,
    workoutType: resolveWorkoutType(row) as WorkoutType,
    startedAt: toIso(row.startedAt) ?? new Date().toISOString(),
    completedAt: toIso(row.completedAt),
    notes: row.notes ?? null,
    totalVolume: row.totalVolume ?? undefined,
    totalSets: row.totalSets ?? undefined,
    durationMinutes: row.durationMinutes ?? undefined,
    exerciseCount: exercises.length,
    templateId: row.templateId ?? null,
    programCycleId: row.programCycleId ?? null,
    cycleWorkoutId: row.cycleWorkoutId ?? null,
    syncStatus: row.syncStatus as WorkoutSyncStatus,
    exercises,
  };
}

function computeWorkoutTotals(exercises: WorkoutExercise[], startedAt: string) {
  const completedAt = new Date();
  let totalSets = 0;
  let totalVolume = 0;
  let totalDuration = 0;
  let totalDistance = 0;

  for (const exercise of exercises) {
    for (const set of exercise.sets ?? []) {
      if (!set.isComplete) continue;
      totalSets++;
      const type = exercise.exerciseType ?? 'weighted';
      if (type === 'weighted') {
        if (set.weight && set.reps) {
          totalVolume += set.weight * set.reps;
        }
      } else if (type === 'bodyweight') {
        if (set.reps) {
          totalVolume += set.weight && set.weight > 0 ? set.reps * set.weight : set.reps;
        }
      }
      if (type === 'timed' || type === 'cardio') {
        if (set.duration) {
          totalDuration += set.duration;
        }
      }
      if (type === 'cardio') {
        if (set.distance) {
          totalDistance += set.distance;
        }
      }
    }
  }

  const elapsedMs = completedAt.getTime() - new Date(startedAt).getTime();
  const rawMinutes = Math.round(elapsedMs / 60000);
  const durationMinutes = rawMinutes > 0 && rawMinutes <= 1440 ? rawMinutes : null;

  return { completedAt, totalSets, totalVolume, durationMinutes, totalDuration, totalDistance };
}

function replaceLocalExercises(workoutId: string, exercises: LocalExerciseInput[]) {
  const db = getLocalDb();
  if (!db) return;

  withLocalTransaction(() => {
    const now = new Date();
    const existing = db
      .select({ id: localWorkoutExercises.id })
      .from(localWorkoutExercises)
      .where(eq(localWorkoutExercises.workoutId, workoutId))
      .all();
    const existingIds = existing.map((row) => row.id);
    if (existingIds.length > 0) {
      db.delete(localWorkoutSets)
        .where(inArray(localWorkoutSets.workoutExerciseId, existingIds))
        .run();
      db.delete(localWorkoutExercises).where(eq(localWorkoutExercises.workoutId, workoutId)).run();
    }

    const usedExerciseIds = new Set<string>();
    const usedSetIds = new Set<string>();

    for (const exercise of exercises) {
      const workoutExerciseId = generateUniqueId(usedExerciseIds, exercise.id);
      db.insert(localWorkoutExercises)
        .values({
          id: workoutExerciseId,
          workoutId,
          exerciseId: exercise.exerciseId,
          libraryId: exercise.libraryId ?? null,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup ?? null,
          exerciseType: exercise.exerciseType ?? 'weighted',
          orderIndex: exercise.orderIndex,
          notes: exercise.notes ?? null,
          isAmrap: exercise.isAmrap ?? false,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      for (const set of exercise.sets ?? []) {
        const setId = generateUniqueId(usedSetIds, set.id);
        db.insert(localWorkoutSets)
          .values({
            id: setId,
            workoutExerciseId,
            setNumber: set.setNumber,
            weight: set.weight ?? null,
            reps: set.reps ?? null,
            rpe: set.rpe ?? null,
            duration: set.duration ?? null,
            distance: set.distance ?? null,
            height: set.height ?? null,
            isComplete: set.isComplete ?? false,
            completedAt: toDate(set.completedAt),
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }
  });
}

export async function createLocalWorkout(
  userId: string,
  input: {
    id?: string;
    name: string;
    templateId?: string | null;
    programCycleId?: string | null;
    cycleWorkoutId?: string | null;
    workoutType?: WorkoutType;
    startedAt?: Date | string | number;
    exercises?: LocalExerciseInput[];
  },
) {
  const db = getLocalDb();
  const id = input.id ?? generateId();
  if (!db) return null;

  const now = new Date();
  withLocalTransaction(() => {
    db.insert(localWorkouts)
      .values({
        id,
        userId,
        templateId: input.templateId ?? null,
        programCycleId: input.programCycleId ?? null,
        cycleWorkoutId: input.cycleWorkoutId ?? null,
        workoutType: input.workoutType ?? resolveWorkoutType(input),
        name: input.name,
        startedAt: toDate(input.startedAt) ?? now,
        completedAt: null,
        notes: null,
        totalVolume: null,
        totalSets: null,
        durationMinutes: null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
        syncOperationId: null,
        syncAttemptCount: 0,
        lastSyncError: null,
        lastSyncAttemptAt: null,
        serverUpdatedAt: null,
        createdLocally: true,
      })
      .onConflictDoUpdate({
        target: localWorkouts.id,
        set: {
          name: input.name,
          templateId: input.templateId ?? null,
          programCycleId: input.programCycleId ?? null,
          cycleWorkoutId: input.cycleWorkoutId ?? null,
          workoutType: input.workoutType ?? resolveWorkoutType(input),
          isDeleted: false,
          syncStatus: 'local',
          syncOperationId: null,
          updatedAt: now,
        },
      })
      .run();

    replaceLocalExercises(id, input.exercises ?? []);
  });
  return getLocalWorkout(id);
}

export async function createLocalWorkoutFromTemplate(
  userId: string,
  templateId: string,
  fallbackHistorySnapshots: ExerciseHistorySnapshot[] = [],
  providedExercises?: {
    exerciseId: string;
    name: string;
    muscleGroup: string | null;
    exerciseType?: string | null;
    sets: number;
    reps: number;
    isAmrap: boolean;
    targetWeight: number;
    addedWeight: number;
    targetDuration?: number | null;
    targetDistance?: number | null;
    targetHeight?: number | null;
    orderIndex: number;
  }[],
) {
  const db = getLocalDb();
  if (!db) return null;

  const template = db.select().from(localTemplates).where(eq(localTemplates.id, templateId)).get();
  if (!template && !providedExercises) return null;

  const exercises =
    providedExercises ??
    db
      .select()
      .from(localTemplateExercises)
      .where(eq(localTemplateExercises.templateId, templateId))
      .orderBy(localTemplateExercises.orderIndex)
      .all();
  const historySnapshots = await getLocalLastCompletedExerciseSnapshots(
    userId,
    exercises.map((exercise) => exercise.exerciseId),
    exercises.map((exercise) => exercise.name),
  );
  const historyByExerciseId = new Map<string, ExerciseHistorySnapshot>(
    fallbackHistorySnapshots.map((snapshot) => [snapshot.exerciseId, snapshot]),
  );
  for (const snapshot of historySnapshots) {
    historyByExerciseId.set(snapshot.exerciseId, snapshot);
  }

  return createLocalWorkout(userId, {
    name: template?.name ?? 'Workout',
    templateId,
    exercises: exercises.map((exercise) => {
      const historySnapshot = historyByExerciseId.get(exercise.exerciseId);
      const plannedSetCount = Math.max(1, exercise.sets ?? 3);
      // Use planned set count from template, but if history has more sets, use the larger value
      const historySetCount = historySnapshot?.sets.length ?? 0;
      const setCount = Math.max(plannedSetCount, historySetCount);

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        exerciseType: exercise.exerciseType ?? 'weighted',
        orderIndex: exercise.orderIndex,
        isAmrap: Boolean(exercise.isAmrap),
        sets: Array.from({ length: setCount }, (_, index) => ({
          setNumber: index + 1,
          weight:
            index < historySetCount
              ? (historySnapshot!.sets[index].weight ?? buildPlannedSetValues(exercise).weight)
              : buildPlannedSetValues(exercise).weight,
          reps:
            index < historySetCount
              ? (historySnapshot!.sets[index].reps ?? buildPlannedSetValues(exercise).reps)
              : buildPlannedSetValues(exercise).reps,
          rpe: index < historySetCount ? (historySnapshot!.sets[index].rpe ?? null) : null,
          duration:
            index < historySetCount
              ? (historySnapshot!.sets[index].duration ?? buildPlannedSetValues(exercise).duration)
              : buildPlannedSetValues(exercise).duration,
          distance:
            index < historySetCount
              ? (historySnapshot!.sets[index].distance ?? buildPlannedSetValues(exercise).distance)
              : buildPlannedSetValues(exercise).distance,
          height:
            index < historySetCount
              ? (historySnapshot!.sets[index].height ?? buildPlannedSetValues(exercise).height)
              : buildPlannedSetValues(exercise).height,
          isComplete: false,
        })),
      };
    }),
  });
}

export async function getLocalLastCompletedExerciseSnapshots(
  userId: string,
  exerciseIds: string[],
  exerciseNames: string[] = [],
) {
  const db = getLocalDb();
  if (!db || (exerciseIds.length === 0 && exerciseNames.length === 0)) return [];
  const requestedIds = uniqueIds(exerciseIds);
  const requestedNames = Array.from(
    new Set(exerciseNames.map(normalizeExerciseName).filter(Boolean) as string[]),
  );
  if (requestedIds.length === 0 && requestedNames.length === 0) return [];

  const aliasToOriginalId = new Map<string, string>(requestedIds.map((id) => [id, id]));
  const nameToOriginalId = new Map<string, string>();
  for (let index = 0; index < requestedNames.length; index++) {
    nameToOriginalId.set(requestedNames[index], requestedIds[index] ?? requestedNames[index]);
  }
  const userExerciseRows = db
    .select({
      id: localUserExercises.id,
      libraryId: localUserExercises.libraryId,
      name: localUserExercises.name,
    })
    .from(localUserExercises)
    .where(eq(localUserExercises.userId, userId))
    .all();

  for (const row of userExerciseRows) {
    const originalId = requestedIds.includes(row.id)
      ? row.id
      : row.libraryId && requestedIds.includes(row.libraryId)
        ? row.libraryId
        : normalizeExerciseName(row.name)
          ? (nameToOriginalId.get(normalizeExerciseName(row.name) ?? '') ?? null)
          : null;
    if (!originalId) continue;
    aliasToOriginalId.set(row.id, originalId);
    if (row.libraryId) {
      aliasToOriginalId.set(row.libraryId, originalId);
    }
  }

  const lookupIds = Array.from(aliasToOriginalId.keys());
  const historyIdentityConditions = [];
  if (lookupIds.length > 0) {
    historyIdentityConditions.push(inArray(localWorkoutExercises.exerciseId, lookupIds));
    historyIdentityConditions.push(inArray(localWorkoutExercises.libraryId, lookupIds));
  }
  if (requestedNames.length > 0) {
    historyIdentityConditions.push(
      inArray(sql`lower(${localWorkoutExercises.name})`, requestedNames),
    );
  }
  if (historyIdentityConditions.length === 0) return [];

  const recentRows = db
    .select({
      workoutExerciseId: localWorkoutExercises.id,
      exerciseId: localWorkoutExercises.exerciseId,
      libraryId: localWorkoutExercises.libraryId,
      name: localWorkoutExercises.name,
      workoutCompletedAt: localWorkouts.completedAt,
    })
    .from(localWorkoutExercises)
    .innerJoin(localWorkouts, eq(localWorkoutExercises.workoutId, localWorkouts.id))
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.isDeleted, false),
        eq(localWorkouts.workoutType, WORKOUT_TYPE_TRAINING),
        eq(localWorkoutExercises.isDeleted, false),
        isNotNull(localWorkouts.completedAt),
        or(...historyIdentityConditions),
      ),
    )
    .orderBy(desc(localWorkouts.completedAt))
    .limit(1000)
    .all();

  const latestByOriginalId = new Map<
    string,
    { workoutExerciseId: string; workoutCompletedAt: Date | null }
  >();
  for (const row of recentRows) {
    const originalId =
      aliasToOriginalId.get(row.exerciseId) ??
      (row.libraryId ? aliasToOriginalId.get(row.libraryId) : undefined) ??
      nameToOriginalId.get(normalizeExerciseName(row.name) ?? '') ??
      null;
    if (originalId && !latestByOriginalId.has(originalId)) {
      latestByOriginalId.set(originalId, {
        workoutExerciseId: row.workoutExerciseId,
        workoutCompletedAt: row.workoutCompletedAt,
      });
    }
  }

  const workoutExerciseIds = Array.from(latestByOriginalId.values()).map(
    (row) => row.workoutExerciseId,
  );
  if (workoutExerciseIds.length === 0) return [];

  const setRows = db
    .select({
      workoutExerciseId: localWorkoutSets.workoutExerciseId,
      weight: localWorkoutSets.weight,
      reps: localWorkoutSets.reps,
      rpe: localWorkoutSets.rpe,
      duration: localWorkoutSets.duration,
      distance: localWorkoutSets.distance,
      height: localWorkoutSets.height,
      setNumber: localWorkoutSets.setNumber,
    })
    .from(localWorkoutSets)
    .where(
      and(
        inArray(localWorkoutSets.workoutExerciseId, workoutExerciseIds),
        eq(localWorkoutSets.isDeleted, false),
      ),
    )
    .orderBy(localWorkoutSets.setNumber)
    .limit(1000)
    .all();

  const setsByWorkoutExerciseId = new Map<string, typeof setRows>();
  for (const set of setRows) {
    const sets = setsByWorkoutExerciseId.get(set.workoutExerciseId) ?? [];
    sets.push(set);
    setsByWorkoutExerciseId.set(set.workoutExerciseId, sets);
  }

  return Array.from(latestByOriginalId.entries()).map(([exerciseId, latest]) => ({
    exerciseId,
    workoutDate: latest.workoutCompletedAt
      ? new Date(latest.workoutCompletedAt).toISOString().split('T')[0]
      : null,
    sets: (setsByWorkoutExerciseId.get(latest.workoutExerciseId) ?? []).map((set) => ({
      weight: set.weight,
      reps: set.reps,
      rpe: set.rpe,
      duration: set.duration ?? null,
      distance: set.distance ?? null,
      height: set.height ?? null,
      setNumber: set.setNumber,
    })),
  }));
}

export async function createLocalWorkoutFromProgramCycleWorkout(
  userId: string,
  cycleWorkoutId: string,
) {
  const db = getLocalDb();
  if (!db) return null;

  const cycleWorkout = db
    .select()
    .from(localProgramCycleWorkouts)
    .where(eq(localProgramCycleWorkouts.id, cycleWorkoutId))
    .get();
  if (!cycleWorkout) return null;

  const targetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);
  if (targetLifts.all.length === 0) return null;

  const exercises = consolidateProgramTargetLifts(targetLifts.all).map((exercise, index) => {
    const sets = exercise.segments.flatMap((segment) =>
      Array.from({ length: Math.max(1, segment.sets ?? 1) }, () => ({
        ...buildPlannedSetValues({
          ...segment,
          reps: normalizeProgramReps(segment.reps),
        }),
        rpe: null,
        isComplete: false,
      })),
    );
    return {
      exerciseId:
        exercise.exerciseId ?? exercise.libraryId ?? exercise.accessoryId ?? exercise.name,
      libraryId: exercise.libraryId ?? null,
      name: exercise.name,
      muscleGroup: null,
      exerciseType: exercise.exerciseType ?? 'weighted',
      orderIndex: index,
      isAmrap: exercise.isAmrap,
      sets: sets.map((set, setIndex) => ({ ...set, setNumber: setIndex + 1 })),
    };
  });

  const workout = await createLocalWorkout(userId, {
    name: cycleWorkout.sessionName,
    programCycleId: cycleWorkout.cycleId,
    cycleWorkoutId,
    exercises,
  });
  if (workout?.id) {
    db.update(localProgramCycleWorkouts)
      .set({ workoutId: workout.id, hydratedAt: new Date() })
      .where(eq(localProgramCycleWorkouts.id, cycleWorkoutId))
      .run();
  }
  return workout;
}

export async function createLocalWorkoutFromProgramCycleWorkoutDefinition(
  userId: string,
  cycleWorkout: ProgramCycleWorkoutDefinition,
) {
  const targetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);
  if (targetLifts.all.length === 0) return null;

  const db = getLocalDb();
  if (db) {
    const hydratedAt = new Date();
    db.insert(localProgramCycleWorkouts)
      .values({
        id: cycleWorkout.id,
        cycleId: cycleWorkout.cycleId,
        templateId: cycleWorkout.templateId ?? null,
        weekNumber: cycleWorkout.weekNumber ?? 0,
        sessionNumber: cycleWorkout.sessionNumber ?? 0,
        sessionName: cycleWorkout.sessionName,
        targetLifts: cycleWorkout.targetLifts ?? null,
        isComplete: cycleWorkout.isComplete ?? false,
        workoutId: null,
        scheduledAt: toDate(cycleWorkout.scheduledAt),
        hydratedAt,
      })
      .onConflictDoUpdate({
        target: localProgramCycleWorkouts.id,
        set: {
          templateId: cycleWorkout.templateId ?? null,
          sessionName: cycleWorkout.sessionName,
          targetLifts: cycleWorkout.targetLifts ?? null,
          isComplete: cycleWorkout.isComplete ?? false,
          scheduledAt: toDate(cycleWorkout.scheduledAt),
          hydratedAt,
        },
      })
      .run();
  }

  const exercises = consolidateProgramTargetLifts(targetLifts.all).map((exercise, index) => {
    const sets = exercise.segments.flatMap((segment) =>
      Array.from({ length: Math.max(1, segment.sets ?? 1) }, () => ({
        ...buildPlannedSetValues({
          ...segment,
          reps: normalizeProgramReps(segment.reps),
        }),
        rpe: null,
        isComplete: false,
      })),
    );
    return {
      exerciseId:
        exercise.exerciseId ?? exercise.libraryId ?? exercise.accessoryId ?? exercise.name,
      libraryId: exercise.libraryId ?? null,
      name: exercise.name,
      muscleGroup: null,
      exerciseType: exercise.exerciseType ?? 'weighted',
      orderIndex: index,
      isAmrap: exercise.isAmrap,
      sets: sets.map((set, setIndex) => ({ ...set, setNumber: setIndex + 1 })),
    };
  });

  const workout = await createLocalWorkout(userId, {
    name: cycleWorkout.sessionName,
    programCycleId: cycleWorkout.cycleId,
    cycleWorkoutId: cycleWorkout.id,
    exercises,
  });

  if (workout?.id && db) {
    db.update(localProgramCycleWorkouts)
      .set({ workoutId: workout.id, hydratedAt: new Date() })
      .where(eq(localProgramCycleWorkouts.id, cycleWorkout.id))
      .run();
  }

  return workout;
}

export async function createLocalWorkoutFromCurrentProgramCycle(userId: string, cycleId: string) {
  const db = getLocalDb();
  if (!db) return null;
  const cycle = db
    .select()
    .from(localProgramCycles)
    .where(and(eq(localProgramCycles.id, cycleId), eq(localProgramCycles.userId, userId)))
    .get();
  if (!cycle) return null;
  const workouts = db
    .select()
    .from(localProgramCycleWorkouts)
    .where(eq(localProgramCycleWorkouts.cycleId, cycleId))
    .orderBy(localProgramCycleWorkouts.weekNumber, localProgramCycleWorkouts.sessionNumber)
    .all();
  const current = getCurrentCycleWorkout(cycle, workouts);
  if (!current) return null;
  if (current.workoutId) {
    const existing = await getLocalWorkout(current.workoutId);
    if (existing) return existing;
  }
  return createLocalWorkoutFromProgramCycleWorkout(userId, current.id);
}

export async function getLocalWorkout(workoutId: string): Promise<Workout | null> {
  const db = getLocalDb();
  if (!db) return null;

  const workout = db
    .select()
    .from(localWorkouts)
    .where(and(eq(localWorkouts.id, workoutId), eq(localWorkouts.isDeleted, false)))
    .get();
  if (!workout) return null;

  const exerciseRows = db
    .select()
    .from(localWorkoutExercises)
    .where(
      and(
        eq(localWorkoutExercises.workoutId, workoutId),
        eq(localWorkoutExercises.isDeleted, false),
      ),
    )
    .orderBy(localWorkoutExercises.orderIndex)
    .all();
  const exerciseIds = exerciseRows.map((row) => row.id);
  const setRows =
    exerciseIds.length > 0
      ? db
          .select()
          .from(localWorkoutSets)
          .where(
            and(
              inArray(localWorkoutSets.workoutExerciseId, exerciseIds),
              eq(localWorkoutSets.isDeleted, false),
            ),
          )
          .orderBy(localWorkoutSets.setNumber)
          .all()
      : [];

  const setsByExercise = new Map<string, LocalWorkoutSet[]>();
  for (const set of setRows) {
    const current = setsByExercise.get(set.workoutExerciseId) ?? [];
    current.push(set);
    setsByExercise.set(set.workoutExerciseId, current);
  }

  const exercises = exerciseRows.map(
    (exercise): WorkoutExercise => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      libraryId: exercise.libraryId,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup ?? null,
      exerciseType: exercise.exerciseType ?? 'weighted',
      orderIndex: exercise.orderIndex,
      notes: exercise.notes ?? null,
      isAmrap: Boolean(exercise.isAmrap),
      sets: (setsByExercise.get(exercise.id) ?? []).map(asWorkoutSet),
    }),
  );

  return asWorkout(workout, exercises);
}

export async function listLocalWorkoutHistory(userId: string, limit = 50) {
  const db = getLocalDb();
  if (!db) return [];

  const rows = db
    .select()
    .from(localWorkouts)
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.isDeleted, false),
        isNotNull(localWorkouts.completedAt),
      ),
    )
    .orderBy(desc(localWorkouts.startedAt))
    .limit(limit)
    .all();

  const workoutIds = rows.map((row) => row.id);
  const exerciseRows =
    workoutIds.length > 0
      ? db
          .select({
            id: localWorkoutExercises.id,
            workoutId: localWorkoutExercises.workoutId,
          })
          .from(localWorkoutExercises)
          .where(inArray(localWorkoutExercises.workoutId, workoutIds))
          .all()
      : [];
  const counts = new Map<string, number>();
  for (const row of exerciseRows) {
    counts.set(row.workoutId, (counts.get(row.workoutId) ?? 0) + 1);
  }

  return rows.map(
    (row): LocalWorkoutHistoryItem => ({
      id: row.id,
      name: row.name,
      startedAt: toIso(row.startedAt) ?? new Date().toISOString(),
      completedAt: toIso(row.completedAt),
      durationMinutes: row.durationMinutes ?? null,
      totalVolume: row.totalVolume ?? null,
      totalSets: row.totalSets ?? null,
      exerciseCount: counts.get(row.id) ?? 0,
      syncStatus: row.syncStatus as WorkoutSyncStatus,
      lastSyncError: row.lastSyncError ?? null,
    }),
  );
}

export async function upsertServerWorkoutSnapshot(userId: string, serverWorkout: Workout) {
  const db = getLocalDb();
  if (!db) return null;

  const now = new Date();
  const completedAt = toDate(serverWorkout.completedAt);
  withLocalTransaction(() => {
    db.insert(localWorkouts)
      .values({
        id: serverWorkout.id,
        userId,
        templateId: (serverWorkout as any).templateId ?? null,
        programCycleId: (serverWorkout as any).programCycleId ?? null,
        cycleWorkoutId: (serverWorkout as any).cycleWorkoutId ?? null,
        workoutType: resolveWorkoutType(serverWorkout),
        name: serverWorkout.name,
        startedAt: toDate(serverWorkout.startedAt) ?? now,
        completedAt,
        notes: serverWorkout.notes ?? null,
        totalVolume: serverWorkout.totalVolume ?? null,
        totalSets: serverWorkout.totalSets ?? null,
        durationMinutes: serverWorkout.durationMinutes ?? null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'synced',
        syncOperationId: null,
        syncAttemptCount: 0,
        lastSyncError: null,
        lastSyncAttemptAt: null,
        serverUpdatedAt: now,
        createdLocally: false,
      })
      .onConflictDoUpdate({
        target: localWorkouts.id,
        set: {
          name: serverWorkout.name,
          templateId: (serverWorkout as any).templateId ?? null,
          programCycleId: (serverWorkout as any).programCycleId ?? null,
          cycleWorkoutId: (serverWorkout as any).cycleWorkoutId ?? null,
          workoutType: resolveWorkoutType(serverWorkout),
          startedAt: toDate(serverWorkout.startedAt) ?? now,
          completedAt,
          totalVolume: serverWorkout.totalVolume ?? null,
          totalSets: serverWorkout.totalSets ?? null,
          durationMinutes: serverWorkout.durationMinutes ?? null,
          syncStatus: 'synced',
          lastSyncError: null,
          serverUpdatedAt: now,
          updatedAt: now,
        },
      })
      .run();

    if (serverWorkout.exercises && serverWorkout.exercises.length > 0) {
      replaceLocalExercises(
        serverWorkout.id,
        serverWorkout.exercises.map((exercise) => ({
          id: exercise.id,
          exerciseId: exercise.exerciseId,
          libraryId: (exercise as any).libraryId ?? null,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          exerciseType: exercise.exerciseType ?? 'weighted',
          orderIndex: exercise.orderIndex,
          notes: exercise.notes,
          isAmrap: exercise.isAmrap,
          sets: (exercise.sets ?? []).map((set) => ({
            id: set.id,
            setNumber: set.setNumber,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            duration: set.duration,
            distance: set.distance,
            height: set.height,
            isComplete: set.isComplete,
            completedAt: set.completedAt,
          })),
        })),
      );
    }
  });

  return getLocalWorkout(serverWorkout.id);
}

export async function completeLocalWorkout(
  userId: string,
  workout: Workout,
  exercises: WorkoutExercise[],
) {
  const db = getLocalDb();
  if (!db) return null;

  const existing = db.select().from(localWorkouts).where(eq(localWorkouts.id, workout.id)).get();
  if (!existing) {
    await createLocalWorkout(userId, {
      id: workout.id,
      name: workout.name,
      startedAt: workout.startedAt,
      templateId: (workout as any).templateId ?? null,
      programCycleId: (workout as any).programCycleId ?? null,
      cycleWorkoutId: (workout as any).cycleWorkoutId ?? null,
      workoutType: resolveWorkoutType(workout),
      exercises: [],
    });
  }

  const totals = computeWorkoutTotals(exercises, workout.startedAt);
  const syncOperationId = generateId();
  withLocalTransaction(() => {
    db.update(localWorkouts)
      .set({
        completedAt: totals.completedAt,
        totalVolume: totals.totalVolume,
        totalSets: totals.totalSets,
        durationMinutes: totals.durationMinutes,
        workoutType: resolveWorkoutType(workout),
        updatedAt: totals.completedAt,
        syncStatus: 'pending',
        syncOperationId,
        lastSyncError: null,
      })
      .where(eq(localWorkouts.id, workout.id))
      .run();

    replaceLocalExercises(
      workout.id,
      exercises.map((exercise, exerciseIndex) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        libraryId: (exercise as any).libraryId ?? null,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        exerciseType: exercise.exerciseType ?? 'weighted',
        orderIndex: exerciseIndex,
        notes: exercise.notes,
        isAmrap: exercise.isAmrap,
        sets: (exercise.sets ?? []).map((set, setIndex) => ({
          id: set.id,
          setNumber: setIndex + 1,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          duration: set.duration,
          distance: set.distance,
          height: set.height,
          isComplete: set.isComplete,
          completedAt: set.isComplete ? (set.completedAt ?? totals.completedAt) : null,
        })),
      })),
    );
  });

  return { workout: await getLocalWorkout(workout.id), syncOperationId };
}

export async function saveLocalWorkoutDraft(
  userId: string,
  workout: Workout,
  exercises: WorkoutExercise[],
) {
  const db = getLocalDb();
  if (!db || workout.completedAt) return null;

  const existing = db.select().from(localWorkouts).where(eq(localWorkouts.id, workout.id)).get();
  if (!existing) {
    await createLocalWorkout(userId, {
      id: workout.id,
      name: workout.name,
      startedAt: workout.startedAt,
      templateId: (workout as any).templateId ?? null,
      programCycleId: (workout as any).programCycleId ?? null,
      cycleWorkoutId: (workout as any).cycleWorkoutId ?? null,
      workoutType: resolveWorkoutType(workout),
      exercises: [],
    });
  }

  const now = new Date();
  withLocalTransaction(() => {
    db.update(localWorkouts)
      .set({
        name: workout.name,
        notes: workout.notes ?? null,
        templateId: (workout as any).templateId ?? existing?.templateId ?? null,
        programCycleId: (workout as any).programCycleId ?? existing?.programCycleId ?? null,
        cycleWorkoutId: (workout as any).cycleWorkoutId ?? existing?.cycleWorkoutId ?? null,
        workoutType: resolveWorkoutType(workout),
        updatedAt: now,
        syncStatus: existing?.syncStatus === 'synced' ? 'synced' : 'local',
      })
      .where(eq(localWorkouts.id, workout.id))
      .run();

    replaceLocalExercises(
      workout.id,
      exercises.map((exercise, exerciseIndex) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        libraryId: (exercise as any).libraryId ?? null,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        exerciseType: exercise.exerciseType ?? 'weighted',
        orderIndex: exerciseIndex,
        notes: exercise.notes,
        isAmrap: exercise.isAmrap,
        sets: (exercise.sets ?? []).map((set, setIndex) => ({
          id: set.id,
          setNumber: setIndex + 1,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          duration: set.duration,
          distance: set.distance,
          height: set.height,
          isComplete: set.isComplete,
          completedAt: set.completedAt,
        })),
      })),
    );
  });

  return getLocalWorkout(workout.id);
}

export async function discardLocalWorkout(workoutId: string, cycleWorkoutId?: string | null) {
  const db = getLocalDb();
  if (!db) return;

  // Clear from pending workouts storage
  await removePendingWorkout(workoutId);

  const now = new Date();
  withLocalTransaction(() => {
    const existing = db
      .select({ id: localWorkoutExercises.id })
      .from(localWorkoutExercises)
      .where(eq(localWorkoutExercises.workoutId, workoutId))
      .all();
    const existingIds = existing.map((row) => row.id);
    if (existingIds.length > 0) {
      db.update(localWorkoutSets)
        .set({ isDeleted: true, updatedAt: now })
        .where(inArray(localWorkoutSets.workoutExerciseId, existingIds))
        .run();
    }
    db.update(localWorkoutExercises)
      .set({ isDeleted: true, updatedAt: now })
      .where(eq(localWorkoutExercises.workoutId, workoutId))
      .run();
    db.update(localWorkouts)
      .set({ isDeleted: true, syncStatus: 'local', updatedAt: now })
      .where(eq(localWorkouts.id, workoutId))
      .run();

    // Clear the cycle workout link so the schedule shows Start again
    const linkedCycleWorkoutId = cycleWorkoutId ?? null;
    if (linkedCycleWorkoutId) {
      db.update(localProgramCycleWorkouts)
        .set({ workoutId: null, isComplete: false })
        .where(eq(localProgramCycleWorkouts.id, linkedCycleWorkoutId))
        .run();
    }
  });
}

export async function enqueueWorkoutDelete(userId: string, workoutId: string) {
  return enqueueSyncItem(userId, 'workout', workoutId, 'delete_workout', {});
}

export async function buildWorkoutCompletionPayload(workoutId: string) {
  const db = getLocalDb();
  if (!db) return null;

  const local = db.select().from(localWorkouts).where(eq(localWorkouts.id, workoutId)).get();
  const workout = await getLocalWorkout(workoutId);
  if (!local || !workout || !local.syncOperationId) return null;

  return {
    syncOperationId: local.syncOperationId,
    workout: {
      id: workout.id,
      name: workout.name,
      templateId: local.templateId,
      programCycleId: local.programCycleId,
      cycleWorkoutId: local.cycleWorkoutId,
      workoutType: local.workoutType ?? resolveWorkoutType(local),
      startedAt: workout.startedAt,
      completedAt: workout.completedAt,
      notes: workout.notes,
      durationMinutes: workout.durationMinutes ?? null,
    },
    exercises: workout.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      libraryId: exercise.libraryId ?? null,
      orderIndex: exercise.orderIndex,
      notes: exercise.notes,
      isAmrap: exercise.isAmrap,
      exerciseType: exercise.exerciseType ?? 'weighted',
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
    })),
    sets: workout.exercises.flatMap((exercise) =>
      (exercise.sets ?? []).map((set) => ({
        id: set.id,
        workoutExerciseId: exercise.id,
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        duration: set.duration,
        distance: set.distance,
        height: set.height,
        isComplete: set.isComplete,
        completedAt: set.completedAt,
      })),
    ),
  };
}

export async function markWorkoutSyncing(workoutId: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  db.update(localWorkouts)
    .set({ syncStatus: 'syncing', lastSyncAttemptAt: now, updatedAt: now })
    .where(eq(localWorkouts.id, workoutId))
    .run();
}

export async function markWorkoutSynced(workoutId: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  db.update(localWorkouts)
    .set({
      syncStatus: 'synced',
      lastSyncError: null,
      serverUpdatedAt: now,
      updatedAt: now,
      createdLocally: false,
    })
    .where(eq(localWorkouts.id, workoutId))
    .run();
}

export async function markWorkoutFailed(workoutId: string, error: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  db.update(localWorkouts)
    .set({ syncStatus: 'failed', lastSyncError: error, updatedAt: now })
    .where(eq(localWorkouts.id, workoutId))
    .run();
}

export async function markWorkoutConflict(workoutId: string, error: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  db.update(localWorkouts)
    .set({ syncStatus: 'conflict', lastSyncError: error, updatedAt: now })
    .where(eq(localWorkouts.id, workoutId))
    .run();
}

export async function cacheTemplates(userId: string, templates: any[]) {
  const db = getLocalDb();
  if (!db) return;
  const hydratedAt = new Date();
  const allExercises: any[] = [];
  for (const template of templates) {
    db.insert(localTemplates)
      .values({
        id: template.id,
        userId,
        name: template.name,
        description: template.description ?? null,
        notes: template.notes ?? null,
        createdAt: toDate(template.createdAt),
        updatedAt: toDate(template.updatedAt),
        hydratedAt,
      })
      .onConflictDoUpdate({
        target: localTemplates.id,
        set: {
          name: template.name,
          description: template.description ?? null,
          notes: template.notes ?? null,
          updatedAt: toDate(template.updatedAt),
          hydratedAt,
        },
      })
      .run();

    db.delete(localTemplateExercises)
      .where(eq(localTemplateExercises.templateId, template.id))
      .run();
    for (const exercise of template.exercises ?? []) {
      allExercises.push({
        id: exercise.id,
        templateId: template.id,
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup ?? null,
        orderIndex: exercise.orderIndex ?? 0,
        targetWeight: exercise.targetWeight ?? null,
        addedWeight: exercise.addedWeight ?? 0,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        repsRaw: exercise.repsRaw ?? null,
        isAmrap: exercise.isAmrap ?? false,
        isAccessory: exercise.isAccessory ?? false,
        isRequired: exercise.isRequired !== false,
      });
    }
  }
  if (allExercises.length > 0) {
    db.insert(localTemplateExercises).values(allExercises).run();
  }
}

export async function cacheUserExercises(userId: string, exercises: any[]) {
  const db = getLocalDb();
  if (!db) return;
  const hydratedAt = new Date();
  for (const exercise of exercises) {
    const createdAt = toDate(exercise.createdAt) ?? hydratedAt;
    const updatedAt = toDate(exercise.updatedAt) ?? hydratedAt;
    db.insert(localUserExercises)
      .values({
        id: exercise.id,
        userId,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup ?? null,
        description: exercise.description ?? null,
        libraryId: exercise.libraryId ?? null,
        createdLocally: false,
        createdAt,
        updatedAt,
        serverUpdatedAt: updatedAt,
        hydratedAt,
      })
      .onConflictDoUpdate({
        target: localUserExercises.id,
        set: {
          name: exercise.name,
          muscleGroup: exercise.muscleGroup ?? null,
          description: exercise.description ?? null,
          libraryId: exercise.libraryId ?? null,
          createdLocally: false,
          updatedAt,
          serverUpdatedAt: updatedAt,
          hydratedAt,
        },
      })
      .run();
  }
}

export async function deleteCachedUserExercise(userId: string, exerciseId: string) {
  const db = getLocalDb();
  if (!db) return;
  db.delete(localUserExercises)
    .where(and(eq(localUserExercises.userId, userId), eq(localUserExercises.id, exerciseId)))
    .run();
}

export async function cacheActivePrograms(userId: string, programs: any[]) {
  const db = getLocalDb();
  if (!db) return;
  const hydratedAt = new Date();
  for (const program of programs) {
    db.insert(localProgramCycles)
      .values({
        id: program.id,
        userId,
        programSlug: program.programSlug,
        name: program.name,
        currentWeek: program.currentWeek ?? null,
        currentSession: program.currentSession ?? null,
        totalSessionsCompleted: program.totalSessionsCompleted ?? 0,
        totalSessionsPlanned: program.totalSessionsPlanned,
        status: 'active',
        hydratedAt,
      })
      .onConflictDoUpdate({
        target: localProgramCycles.id,
        set: {
          name: program.name,
          currentWeek: program.currentWeek ?? null,
          currentSession: program.currentSession ?? null,
          totalSessionsCompleted: program.totalSessionsCompleted ?? 0,
          totalSessionsPlanned: program.totalSessionsPlanned,
          status: 'active',
          hydratedAt,
        },
      })
      .run();
  }
}

export async function markLocalCycleWorkoutComplete(cycleWorkoutId: string, workoutId: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  db.update(localProgramCycleWorkouts)
    .set({ isComplete: true, workoutId, hydratedAt: now })
    .where(eq(localProgramCycleWorkouts.id, cycleWorkoutId))
    .run();
}

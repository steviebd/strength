import { and, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  consolidateProgramTargetLifts,
  getCurrentCycleWorkout,
  generateId,
  normalizeProgramReps,
  parseProgramTargetLifts,
} from '@strength/db/client';
import { getLocalDb } from './client';
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
import type { Workout, WorkoutExercise, WorkoutSet } from '@/context/WorkoutSessionContext';

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
  orderIndex: number;
  notes?: string | null;
  isAmrap?: boolean;
  sets: Array<{
    id?: string;
    setNumber: number;
    weight?: number | null;
    reps?: number | null;
    rpe?: number | null;
    isComplete?: boolean;
    completedAt?: Date | string | null;
  }>;
};

function toDate(value: Date | string | number | null | undefined) {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function toIso(value: Date | string | number | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function asWorkoutSet(row: LocalWorkoutSet): WorkoutSet {
  return {
    id: row.id,
    workoutExerciseId: row.workoutExerciseId,
    setNumber: row.setNumber,
    weight: row.weight ?? null,
    reps: row.reps ?? null,
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

  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.isComplete) continue;
      totalSets++;
      if (set.weight && set.reps) {
        totalVolume += set.weight * set.reps;
      }
    }
  }

  const elapsedMs = completedAt.getTime() - new Date(startedAt).getTime();
  const rawMinutes = Math.round(elapsedMs / 60000);
  const durationMinutes = rawMinutes > 0 && rawMinutes <= 1440 ? rawMinutes : null;

  return { completedAt, totalSets, totalVolume, durationMinutes };
}

async function replaceLocalExercises(workoutId: string, exercises: LocalExerciseInput[]) {
  const db = getLocalDb();
  if (!db) return;

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

  for (const exercise of exercises) {
    const workoutExerciseId = exercise.id ?? generateId();
    db.insert(localWorkoutExercises)
      .values({
        id: workoutExerciseId,
        workoutId,
        exerciseId: exercise.exerciseId,
        libraryId: exercise.libraryId ?? null,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup ?? null,
        orderIndex: exercise.orderIndex,
        notes: exercise.notes ?? null,
        isAmrap: exercise.isAmrap ?? false,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const set of exercise.sets) {
      db.insert(localWorkoutSets)
        .values({
          id: set.id ?? generateId(),
          workoutExerciseId,
          setNumber: set.setNumber,
          weight: set.weight ?? null,
          reps: set.reps ?? null,
          rpe: set.rpe ?? null,
          isComplete: set.isComplete ?? false,
          completedAt: toDate(set.completedAt),
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }
}

export async function createLocalWorkout(
  userId: string,
  input: {
    id?: string;
    name: string;
    templateId?: string | null;
    programCycleId?: string | null;
    cycleWorkoutId?: string | null;
    startedAt?: Date | string | number;
    exercises?: LocalExerciseInput[];
  },
) {
  const db = getLocalDb();
  if (!db) return null;

  const now = new Date();
  const id = input.id ?? generateId();
  db.insert(localWorkouts)
    .values({
      id,
      userId,
      templateId: input.templateId ?? null,
      programCycleId: input.programCycleId ?? null,
      cycleWorkoutId: input.cycleWorkoutId ?? null,
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
        updatedAt: now,
      },
    })
    .run();

  await replaceLocalExercises(id, input.exercises ?? []);
  return getLocalWorkout(id);
}

export async function createLocalWorkoutFromTemplate(userId: string, templateId: string) {
  const db = getLocalDb();
  if (!db) return null;

  const template = db.select().from(localTemplates).where(eq(localTemplates.id, templateId)).get();
  if (!template) return null;

  const exercises = db
    .select()
    .from(localTemplateExercises)
    .where(eq(localTemplateExercises.templateId, templateId))
    .orderBy(localTemplateExercises.orderIndex)
    .all();

  return createLocalWorkout(userId, {
    name: template.name,
    templateId,
    exercises: exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      orderIndex: exercise.orderIndex,
      isAmrap: Boolean(exercise.isAmrap),
      sets: Array.from({ length: Math.max(1, exercise.sets ?? 3) }, (_, index) => ({
        setNumber: index + 1,
        weight: (exercise.targetWeight ?? 0) + (exercise.addedWeight ?? 0),
        reps: exercise.isAmrap ? null : (exercise.reps ?? 10),
        rpe: null,
        isComplete: false,
      })),
    })),
  });
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
  const exercises = consolidateProgramTargetLifts(targetLifts.all).map((exercise, index) => {
    const sets = exercise.segments.flatMap((segment) =>
      Array.from({ length: Math.max(1, segment.sets ?? 1) }, () => ({
        weight: (segment.targetWeight ?? 0) + (segment.addedWeight ?? 0),
        reps: segment.isAmrap ? null : normalizeProgramReps(segment.reps),
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

  const workout = db.select().from(localWorkouts).where(eq(localWorkouts.id, workoutId)).get();
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
  db.insert(localWorkouts)
    .values({
      id: serverWorkout.id,
      userId,
      templateId: (serverWorkout as any).templateId ?? null,
      programCycleId: (serverWorkout as any).programCycleId ?? null,
      cycleWorkoutId: (serverWorkout as any).cycleWorkoutId ?? null,
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

  if (serverWorkout.exercises) {
    await replaceLocalExercises(
      serverWorkout.id,
      serverWorkout.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        libraryId: (exercise as any).libraryId ?? null,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        orderIndex: exercise.orderIndex,
        notes: exercise.notes,
        isAmrap: exercise.isAmrap,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          setNumber: set.setNumber,
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          isComplete: set.isComplete,
          completedAt: set.completedAt,
        })),
      })),
    );
  }

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
      exercises: [],
    });
  }

  const totals = computeWorkoutTotals(exercises, workout.startedAt);
  const syncOperationId = generateId();
  db.update(localWorkouts)
    .set({
      completedAt: totals.completedAt,
      totalVolume: totals.totalVolume,
      totalSets: totals.totalSets,
      durationMinutes: totals.durationMinutes,
      updatedAt: totals.completedAt,
      syncStatus: 'pending',
      syncOperationId,
      lastSyncError: null,
    })
    .where(eq(localWorkouts.id, workout.id))
    .run();

  await replaceLocalExercises(
    workout.id,
    exercises.map((exercise, exerciseIndex) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      libraryId: (exercise as any).libraryId ?? null,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      orderIndex: exerciseIndex,
      notes: exercise.notes,
      isAmrap: exercise.isAmrap,
      sets: exercise.sets.map((set, setIndex) => ({
        id: set.id,
        setNumber: setIndex + 1,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        isComplete: set.isComplete,
        completedAt: set.isComplete ? (set.completedAt ?? totals.completedAt) : null,
      })),
    })),
  );

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
      exercises: [],
    });
  }

  const now = new Date();
  db.update(localWorkouts)
    .set({
      name: workout.name,
      notes: workout.notes ?? null,
      templateId: (workout as any).templateId ?? existing?.templateId ?? null,
      programCycleId: (workout as any).programCycleId ?? existing?.programCycleId ?? null,
      cycleWorkoutId: (workout as any).cycleWorkoutId ?? existing?.cycleWorkoutId ?? null,
      updatedAt: now,
      syncStatus: existing?.syncStatus === 'synced' ? 'synced' : 'local',
    })
    .where(eq(localWorkouts.id, workout.id))
    .run();

  await replaceLocalExercises(
    workout.id,
    exercises.map((exercise, exerciseIndex) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      libraryId: (exercise as any).libraryId ?? null,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      orderIndex: exerciseIndex,
      notes: exercise.notes,
      isAmrap: exercise.isAmrap,
      sets: exercise.sets.map((set, setIndex) => ({
        id: set.id,
        setNumber: setIndex + 1,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        isComplete: set.isComplete,
        completedAt: set.completedAt,
      })),
    })),
  );

  return getLocalWorkout(workout.id);
}

export async function listLocalActiveWorkouts(userId: string) {
  const db = getLocalDb();
  if (!db) return [];
  return db
    .select()
    .from(localWorkouts)
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.isDeleted, false),
        isNull(localWorkouts.completedAt),
      ),
    )
    .orderBy(desc(localWorkouts.startedAt))
    .all();
}

export async function discardLocalWorkout(workoutId: string) {
  const db = getLocalDb();
  if (!db) return;
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
  }
  db.delete(localWorkoutExercises).where(eq(localWorkoutExercises.workoutId, workoutId)).run();
  db.delete(localWorkouts).where(eq(localWorkouts.id, workoutId)).run();
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
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
    })),
    sets: workout.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => ({
        id: set.id,
        workoutExerciseId: exercise.id,
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
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
      db.insert(localTemplateExercises)
        .values({
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
        })
        .run();
    }
  }
}

export async function cacheUserExercises(userId: string, exercises: any[]) {
  const db = getLocalDb();
  if (!db) return;
  const hydratedAt = new Date();
  for (const exercise of exercises) {
    db.insert(localUserExercises)
      .values({
        id: exercise.id,
        userId,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup ?? null,
        description: exercise.description ?? null,
        libraryId: exercise.libraryId ?? null,
        createdAt: toDate(exercise.createdAt),
        updatedAt: toDate(exercise.updatedAt),
        hydratedAt,
      })
      .onConflictDoUpdate({
        target: localUserExercises.id,
        set: {
          name: exercise.name,
          muscleGroup: exercise.muscleGroup ?? null,
          description: exercise.description ?? null,
          libraryId: exercise.libraryId ?? null,
          updatedAt: toDate(exercise.updatedAt),
          hydratedAt,
        },
      })
      .run();
  }
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

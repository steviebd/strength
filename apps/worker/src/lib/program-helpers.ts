import { eq, and, or, gt, desc, sql } from 'drizzle-orm';
import * as schema from '@strength/db';
import { exerciseLibrary } from '@strength/db';
import { getProgramCycleById, getOrCreateExerciseForUser } from '@strength/db';
import { chunkedInsert } from '@strength/db';

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

export function getCurrentCycleWorkout(
  cycle: { currentWeek: number; currentSession: number },
  workouts: Array<{
    id: string;
    weekNumber: number;
    sessionNumber: number;
    isComplete?: boolean;
    targetLifts?: string | null;
    sessionName?: string;
    scheduledAt?: number | null;
    workoutId?: string | null;
  }>,
) {
  return (
    workouts.find(
      (workout) =>
        workout.weekNumber === cycle.currentWeek && workout.sessionNumber === cycle.currentSession,
    ) ??
    workouts.find((workout) => !workout.isComplete) ??
    null
  );
}

export async function getLatestOneRMsForUser(db: any, userId: string) {
  const latestOneRMWorkout = await db
    .select({
      squat1rm: schema.workouts.squat1rm,
      bench1rm: schema.workouts.bench1rm,
      deadlift1rm: schema.workouts.deadlift1rm,
      ohp1rm: schema.workouts.ohp1rm,
      completedAt: schema.workouts.completedAt,
    })
    .from(schema.workouts)
    .where(
      and(
        eq(schema.workouts.userId, userId),
        eq(schema.workouts.name, '1RM Test'),
        sql`${schema.workouts.completedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.workouts.completedAt))
    .limit(1)
    .get();

  if (
    latestOneRMWorkout &&
    (latestOneRMWorkout.squat1rm ||
      latestOneRMWorkout.bench1rm ||
      latestOneRMWorkout.deadlift1rm ||
      latestOneRMWorkout.ohp1rm)
  ) {
    return latestOneRMWorkout;
  }

  const latestCycle = await db
    .select({
      squat1rm: schema.userProgramCycles.squat1rm,
      bench1rm: schema.userProgramCycles.bench1rm,
      deadlift1rm: schema.userProgramCycles.deadlift1rm,
      ohp1rm: schema.userProgramCycles.ohp1rm,
      completedAt: schema.userProgramCycles.startedAt,
    })
    .from(schema.userProgramCycles)
    .where(eq(schema.userProgramCycles.userId, userId))
    .orderBy(desc(schema.userProgramCycles.startedAt))
    .limit(1)
    .get();

  return latestCycle ?? null;
}

export async function getLatestOneRMTestWorkoutForCycle(db: any, userId: string, cycleId: string) {
  return db
    .select()
    .from(schema.workouts)
    .where(
      and(
        eq(schema.workouts.userId, userId),
        eq(schema.workouts.programCycleId, cycleId),
        eq(schema.workouts.name, '1RM Test'),
        eq(schema.workouts.isDeleted, false),
      ),
    )
    .orderBy(desc(schema.workouts.completedAt), desc(schema.workouts.createdAt))
    .limit(1)
    .get();
}

export async function createOneRMTestWorkout(db: any, userId: string, cycleId: string) {
  const cycle = await getProgramCycleById(db, cycleId, userId);
  if (!cycle) {
    return null;
  }

  const existingWorkout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
  if (existingWorkout && !existingWorkout.completedAt) {
    return existingWorkout;
  }

  const now = new Date();

  const workout = await db
    .insert(schema.workouts)
    .values({
      userId,
      programCycleId: cycleId,
      name: '1RM Test',
      notes: null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      startingSquat1rm: cycle.startingSquat1rm ?? cycle.squat1rm,
      startingBench1rm: cycle.startingBench1rm ?? cycle.bench1rm,
      startingDeadlift1rm: cycle.startingDeadlift1rm ?? cycle.deadlift1rm,
      startingOhp1rm: cycle.startingOhp1rm ?? cycle.ohp1rm,
    })
    .returning()
    .get();

  const mainLifts = [
    { name: 'Squat', lift: 'squat' as const },
    { name: 'Bench Press', lift: 'bench' as const },
    { name: 'Deadlift', lift: 'deadlift' as const },
    { name: 'Overhead Press', lift: 'ohp' as const },
  ];

  for (let i = 0; i < mainLifts.length; i++) {
    const lift = mainLifts[i];
    const exerciseId = await getOrCreateExerciseForUser(db, userId, lift.name, lift.lift);
    const workoutExercise = await db
      .insert(schema.workoutExercises)
      .values({
        workoutId: workout.id,
        exerciseId,
        orderIndex: i,
        isAmrap: false,
        updatedAt: now,
      })
      .returning()
      .get();

    await db
      .insert(schema.workoutSets)
      .values({
        workoutExerciseId: workoutExercise.id,
        setNumber: 1,
        weight: 0,
        reps: 1,
        rpe: null,
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  return workout;
}

export async function updateProgramCycleOneRMs(
  db: any,
  userId: string,
  cycleId: string,
  data: { squat1rm?: number; bench1rm?: number; deadlift1rm?: number; ohp1rm?: number },
) {
  const existingCycle = await getProgramCycleById(db, cycleId, userId);
  if (!existingCycle) {
    return null;
  }

  return db
    .update(schema.userProgramCycles)
    .set({
      ...data,
      startingSquat1rm: existingCycle.startingSquat1rm ?? existingCycle.squat1rm,
      startingBench1rm: existingCycle.startingBench1rm ?? existingCycle.bench1rm,
      startingDeadlift1rm: existingCycle.startingDeadlift1rm ?? existingCycle.deadlift1rm,
      startingOhp1rm: existingCycle.startingOhp1rm ?? existingCycle.ohp1rm,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.userProgramCycles.id, cycleId), eq(schema.userProgramCycles.userId, userId)),
    )
    .returning()
    .get();
}

export async function createWorkoutFromProgramCycleWorkout(
  db: any,
  userId: string,
  cycleId: string,
  cycleWorkout: any,
) {
  const now = new Date();
  let createdWorkoutId: string | null = null;
  const workout = await db
    .insert(schema.workouts)
    .values({
      userId,
      programCycleId: cycleId,
      name: cycleWorkout.sessionName,
      notes: null,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  createdWorkoutId = workout.id;

  try {
    const targetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);
    if (targetLifts.all.length === 0) {
      throw new Error(`Program cycle workout ${cycleWorkout.id} has no target lifts`);
    }

    const exerciseIdList: {
      workoutExerciseId: string;
      exerciseId: string;
      orderIndex: number;
      isAmrap: boolean;
      targetLift: any;
    }[] = [];

    for (let i = 0; i < targetLifts.all.length; i++) {
      const targetLift = targetLifts.all[i];
      const isAmrap = targetLift.isAmrap;
      let exerciseId: string;
      if (targetLift.exerciseId) {
        exerciseId = targetLift.exerciseId;
      } else {
        exerciseId = await getOrCreateExerciseForUser(
          db,
          userId,
          targetLift.name,
          targetLift.lift as 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row' | undefined,
          targetLift.libraryId,
        );
      }
      exerciseIdList.push({
        workoutExerciseId: schema.generateId(),
        exerciseId,
        orderIndex: i,
        isAmrap,
        targetLift,
      });
    }

    const workoutExerciseRows = exerciseIdList.map(
      ({ workoutExerciseId, exerciseId, orderIndex, isAmrap }) => ({
        id: workoutExerciseId,
        workoutId: workout.id,
        exerciseId,
        orderIndex,
        isAmrap,
        updatedAt: now,
      }),
    );

    await chunkedInsert(db, { table: schema.workoutExercises, rows: workoutExerciseRows });
    const allSetRows: (typeof schema.workoutSets.$inferInsert)[] = [];

    for (const { workoutExerciseId, isAmrap, targetLift } of exerciseIdList) {
      const fallbackSetCount = normalizeProgramSetCount(targetLift.sets, 1);
      const fallbackWeight =
        typeof targetLift.targetWeight === 'number' && Number.isFinite(targetLift.targetWeight)
          ? targetLift.targetWeight
          : null;
      const fallbackReps = isAmrap ? null : normalizeProgramReps(targetLift.reps);

      const setRows = Array.from({ length: fallbackSetCount }, (_, index) => ({
        workoutExerciseId,
        setNumber: index + 1,
        weight: fallbackWeight,
        reps: fallbackReps,
        rpe: null,
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      }));
      allSetRows.push(...setRows);
    }

    if (allSetRows.length > 0) {
      await chunkedInsert(db, { table: schema.workoutSets, rows: allSetRows });
    }

    await db
      .update(schema.programCycleWorkouts)
      .set({
        workoutId: workout.id,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.programCycleWorkouts.id, cycleWorkout.id),
          eq(schema.programCycleWorkouts.cycleId, cycleId),
        ),
      )
      .run();

    return workout;
  } catch (e) {
    if (createdWorkoutId) {
      await db
        .delete(schema.workouts)
        .where(and(eq(schema.workouts.id, createdWorkoutId), eq(schema.workouts.userId, userId)))
        .run()
        .catch(() => {});
    }
    throw e;
  }
}

export async function advanceProgramCycleForWorkout(db: any, userId: string, workoutId: string) {
  const linkedCycleWorkout = await db
    .select({
      id: schema.programCycleWorkouts.id,
      cycleId: schema.programCycleWorkouts.cycleId,
      weekNumber: schema.programCycleWorkouts.weekNumber,
      sessionNumber: schema.programCycleWorkouts.sessionNumber,
      isComplete: schema.programCycleWorkouts.isComplete,
      currentWeek: schema.userProgramCycles.currentWeek,
      currentSession: schema.userProgramCycles.currentSession,
      totalSessionsCompleted: schema.userProgramCycles.totalSessionsCompleted,
      totalSessionsPlanned: schema.userProgramCycles.totalSessionsPlanned,
    })
    .from(schema.programCycleWorkouts)
    .innerJoin(
      schema.userProgramCycles,
      eq(schema.programCycleWorkouts.cycleId, schema.userProgramCycles.id),
    )
    .where(
      and(
        eq(schema.programCycleWorkouts.workoutId, workoutId),
        eq(schema.userProgramCycles.userId, userId),
      ),
    )
    .get();

  if (!linkedCycleWorkout || linkedCycleWorkout.isComplete) {
    return;
  }

  const nextCycleWorkout = await db
    .select({
      id: schema.programCycleWorkouts.id,
      weekNumber: schema.programCycleWorkouts.weekNumber,
      sessionNumber: schema.programCycleWorkouts.sessionNumber,
    })
    .from(schema.programCycleWorkouts)
    .where(
      and(
        eq(schema.programCycleWorkouts.cycleId, linkedCycleWorkout.cycleId),
        or(
          and(gt(schema.programCycleWorkouts.weekNumber, linkedCycleWorkout.weekNumber)),
          and(
            eq(schema.programCycleWorkouts.weekNumber, linkedCycleWorkout.weekNumber),
            gt(schema.programCycleWorkouts.sessionNumber, linkedCycleWorkout.sessionNumber),
          ),
        ),
        eq(schema.programCycleWorkouts.isComplete, false),
      ),
    )
    .orderBy(schema.programCycleWorkouts.weekNumber, schema.programCycleWorkouts.sessionNumber)
    .limit(1)
    .get();

  const now = new Date();

  await db
    .update(schema.programCycleWorkouts)
    .set({
      isComplete: true,
      updatedAt: now,
    })
    .where(eq(schema.programCycleWorkouts.id, linkedCycleWorkout.id))
    .run();

  const cycleUpdate: Record<string, unknown> = {
    totalSessionsCompleted: linkedCycleWorkout.totalSessionsCompleted + 1,
    updatedAt: now,
  };

  if (nextCycleWorkout) {
    cycleUpdate.currentWeek = nextCycleWorkout.weekNumber;
    cycleUpdate.currentSession = nextCycleWorkout.sessionNumber;
  } else {
    cycleUpdate.status = 'completed';
    cycleUpdate.isComplete = true;
    cycleUpdate.completedAt = now;
  }

  await db
    .update(schema.userProgramCycles)
    .set(cycleUpdate)
    .where(
      and(
        eq(schema.userProgramCycles.id, linkedCycleWorkout.cycleId),
        eq(schema.userProgramCycles.userId, userId),
      ),
    )
    .run();
}

export async function resolveToUserExerciseId(
  db: any,
  userId: string,
  exerciseId: string,
): Promise<string> {
  const existingExercise = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.userId, userId)))
    .get();

  if (existingExercise) {
    return existingExercise.id;
  }

  const existingLibraryExercise = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.userId, userId), eq(schema.exercises.libraryId, exerciseId)))
    .get();

  if (existingLibraryExercise) {
    return existingLibraryExercise.id;
  }

  const libraryExercise = exerciseLibrary.find((e) => e.id === exerciseId);

  if (libraryExercise) {
    const now = new Date();
    const created = await db
      .insert(schema.exercises)
      .values({
        userId,
        name: libraryExercise.name,
        muscleGroup: libraryExercise.muscleGroup,
        description: libraryExercise.description,
        libraryId: libraryExercise.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.exercises.id })
      .get();
    return created.id;
  }

  return exerciseId;
}

export async function findExistingUserExerciseByName(db: any, userId: string, name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (!normalizedName) {
    return null;
  }

  return db
    .select()
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.userId, userId),
        eq(schema.exercises.isDeleted, false),
        sql`lower(${schema.exercises.name}) = ${normalizedName}`,
      ),
    )
    .get();
}

export async function getLastCompletedExerciseSnapshot(
  db: any,
  userId: string,
  exerciseId: string,
) {
  let resolvedExerciseId: string | null = null;

  const directExercise = await db
    .select({ id: schema.exercises.id, libraryId: schema.exercises.libraryId })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exerciseId), eq(schema.exercises.userId, userId)))
    .get();

  if (directExercise) {
    resolvedExerciseId = directExercise.id;
  } else {
    const byLibraryId = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.libraryId, exerciseId), eq(schema.exercises.userId, userId)))
      .get();

    if (byLibraryId) {
      resolvedExerciseId = byLibraryId.id;
    }
  }

  if (!resolvedExerciseId) {
    return null;
  }

  const recentWorkoutExercise = await db
    .select({
      workoutExerciseId: schema.workoutExercises.id,
      workoutCompletedAt: schema.workouts.completedAt,
    })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(
      and(
        eq(schema.workoutExercises.exerciseId, resolvedExerciseId),
        eq(schema.workouts.userId, userId),
        sql`${schema.workouts.completedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.workouts.completedAt))
    .limit(1)
    .get();

  if (!recentWorkoutExercise) {
    return null;
  }

  const allSets = await db
    .select({
      weight: schema.workoutSets.weight,
      reps: schema.workoutSets.reps,
      rpe: schema.workoutSets.rpe,
      setNumber: schema.workoutSets.setNumber,
    })
    .from(schema.workoutSets)
    .where(eq(schema.workoutSets.workoutExerciseId, recentWorkoutExercise.workoutExerciseId))
    .orderBy(schema.workoutSets.setNumber)
    .all();

  return {
    exerciseId: resolvedExerciseId,
    workoutDate: recentWorkoutExercise.workoutCompletedAt
      ? new Date(recentWorkoutExercise.workoutCompletedAt).toISOString().split('T')[0]
      : null,
    sets: allSets.map(
      (s: {
        weight: number | null;
        reps: number | null;
        rpe: number | null;
        setNumber: number | null;
      }) => ({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        setNumber: s.setNumber,
      }),
    ),
  };
}

import { eq, and, or, gt, gte, desc, sql, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { exerciseLibrary } from '@strength/db';
import { getProgramCycleById, getOrCreateExerciseForUser } from '@strength/db';
import { chunkArray, getSafeInsertChunkSize, chunkedQueryMany } from '@strength/db';
import {
  consolidateProgramTargetLifts,
  consolidateProgramTargetLiftsForWorkoutSections,
  getCurrentCycleWorkout,
  isProgramAmrap,
  normalizeProgramReps,
  normalizeProgramSetCount,
  normalizeProgramTargetLift,
  parseProgramTargetLifts,
  type NormalizedProgramTargetLift,
  type SerializedProgramTargetLift,
} from '@strength/db';

export {
  consolidateProgramTargetLifts,
  consolidateProgramTargetLiftsForWorkoutSections,
  getCurrentCycleWorkout,
  isProgramAmrap,
  normalizeProgramReps,
  normalizeProgramSetCount,
  normalizeProgramTargetLift,
  parseProgramTargetLifts,
  type NormalizedProgramTargetLift,
  type SerializedProgramTargetLift,
};

function buildProgramSetValues(segment: NormalizedProgramTargetLift) {
  const type = segment.exerciseType ?? 'weights';
  const reps = segment.isAmrap ? null : normalizeProgramReps(segment.reps);
  const weight =
    type === 'weights'
      ? (segment.targetWeight ?? 0) + segment.addedWeight
      : type === 'bodyweight' && ((segment.targetWeight ?? 0) > 0 || segment.addedWeight > 0)
        ? (segment.targetWeight ?? 0) + segment.addedWeight
        : null;
  return {
    weight,
    reps: type === 'timed' || type === 'cardio' ? null : reps,
    duration: type === 'timed' || type === 'cardio' ? (segment.targetDuration ?? 0) : null,
    distance: type === 'cardio' ? segment.targetDistance : null,
    height: type === 'plyo' ? (segment.targetHeight ?? 0) : null,
  };
}

function hasAnyRecordedOneRM(oneRMs: {
  squat1rm?: number | null;
  bench1rm?: number | null;
  deadlift1rm?: number | null;
  ohp1rm?: number | null;
}) {
  return (
    (oneRMs.squat1rm ?? 0) > 0 ||
    (oneRMs.bench1rm ?? 0) > 0 ||
    (oneRMs.deadlift1rm ?? 0) > 0 ||
    (oneRMs.ohp1rm ?? 0) > 0
  );
}

function mergeOneRMValues(
  base: {
    squat1rm?: number | null;
    bench1rm?: number | null;
    deadlift1rm?: number | null;
    ohp1rm?: number | null;
    completedAt?: Date | number | string | null;
  },
  fallback: {
    squat1rm?: number | null;
    bench1rm?: number | null;
    deadlift1rm?: number | null;
    ohp1rm?: number | null;
  },
) {
  return {
    squat1rm: (base.squat1rm ?? 0) > 0 ? base.squat1rm : (fallback.squat1rm ?? null),
    bench1rm: (base.bench1rm ?? 0) > 0 ? base.bench1rm : (fallback.bench1rm ?? null),
    deadlift1rm: (base.deadlift1rm ?? 0) > 0 ? base.deadlift1rm : (fallback.deadlift1rm ?? null),
    ohp1rm: (base.ohp1rm ?? 0) > 0 ? base.ohp1rm : (fallback.ohp1rm ?? null),
    completedAt: base.completedAt,
  };
}

export function getOneRMsFromCompletedTestSetRows(
  rows: Array<{ exerciseName: string | null; weight: number | null }>,
) {
  const oneRMs = {
    squat1rm: null as number | null,
    bench1rm: null as number | null,
    deadlift1rm: null as number | null,
    ohp1rm: null as number | null,
  };

  const nameToKey: Record<string, keyof typeof oneRMs> = {
    squat: 'squat1rm',
    'bench press': 'bench1rm',
    deadlift: 'deadlift1rm',
    'overhead press': 'ohp1rm',
  };

  for (const row of rows) {
    if (!row.exerciseName || row.weight === null || row.weight <= 0) {
      continue;
    }

    const key = nameToKey[row.exerciseName.trim().toLowerCase()];
    if (!key) {
      continue;
    }

    oneRMs[key] = Math.max(oneRMs[key] ?? 0, row.weight);
  }

  return oneRMs;
}

async function getOneRMsFromCompletedTestSets(db: any, workoutId: string) {
  const rows = await db
    .select({
      exerciseName: schema.exercises.name,
      weight: schema.workoutSets.weight,
    })
    .from(schema.workoutExercises)
    .innerJoin(schema.exercises, eq(schema.workoutExercises.exerciseId, schema.exercises.id))
    .innerJoin(
      schema.workoutSets,
      eq(schema.workoutExercises.id, schema.workoutSets.workoutExerciseId),
    )
    .where(
      and(
        eq(schema.workoutExercises.workoutId, workoutId),
        eq(schema.workoutSets.isComplete, true),
      ),
    )
    .all();

  return getOneRMsFromCompletedTestSetRows(rows);
}

export async function getLatestOneRMsForUser(db: any, userId: string) {
  const latestOneRMWorkout = await db
    .select({
      id: schema.workouts.id,
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
        eq(schema.workouts.workoutType, schema.WORKOUT_TYPE_ONE_RM_TEST),
        eq(schema.workouts.isDeleted, false),
        sql`${schema.workouts.completedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(schema.workouts.completedAt))
    .limit(1)
    .get();

  if (latestOneRMWorkout) {
    const setOneRMs = await getOneRMsFromCompletedTestSets(db, latestOneRMWorkout.id);
    const mergedOneRMs = mergeOneRMValues(latestOneRMWorkout, setOneRMs);
    if (hasAnyRecordedOneRM(mergedOneRMs)) {
      return mergedOneRMs;
    }
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
    .where(
      and(
        eq(schema.userProgramCycles.userId, userId),
        or(
          gt(schema.userProgramCycles.squat1rm, 0),
          gt(schema.userProgramCycles.bench1rm, 0),
          gt(schema.userProgramCycles.deadlift1rm, 0),
          gt(schema.userProgramCycles.ohp1rm, 0),
        ),
      ),
    )
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
        eq(schema.workouts.workoutType, schema.WORKOUT_TYPE_ONE_RM_TEST),
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
  const workoutId = schema.generateId();

  const workoutValues = {
    id: workoutId,
    userId,
    programCycleId: cycleId,
    workoutType: schema.WORKOUT_TYPE_ONE_RM_TEST,
    name: '1RM Test',
    notes: null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
    startingSquat1rm: cycle.startingSquat1rm ?? cycle.squat1rm,
    startingBench1rm: cycle.startingBench1rm ?? cycle.bench1rm,
    startingDeadlift1rm: cycle.startingDeadlift1rm ?? cycle.deadlift1rm,
    startingOhp1rm: cycle.startingOhp1rm ?? cycle.ohp1rm,
  };

  const mainLifts = [
    { name: 'Squat', lift: 'squat' as const },
    { name: 'Bench Press', lift: 'bench' as const },
    { name: 'Deadlift', lift: 'deadlift' as const },
    { name: 'Overhead Press', lift: 'ohp' as const },
  ];

  const exerciseIds = await Promise.all(
    mainLifts.map((lift) => getOrCreateExerciseForUser(db, userId, lift.name, lift.lift)),
  );

  const workoutExerciseRows = mainLifts.map((_, i) => ({
    id: schema.generateId(),
    workoutId,
    exerciseId: exerciseIds[i],
    orderIndex: i,
    isAmrap: false,
    updatedAt: now,
  }));

  const setRows = workoutExerciseRows.map((we) => ({
    workoutExerciseId: we.id,
    setNumber: 1,
    weight: 0,
    reps: 1,
    rpe: null,
    isComplete: false,
    createdAt: now,
    updatedAt: now,
  }));

  await db.batch([
    db.insert(schema.workouts).values(workoutValues).onConflictDoNothing(),
    db.insert(schema.workoutExercises).values(workoutExerciseRows),
    db.insert(schema.workoutSets).values(setRows),
  ]);

  return workoutValues;
}

export async function updateProgramCycleOneRMs(
  db: any,
  userId: string,
  cycleId: string,
  data: {
    squat1rm?: number | null;
    bench1rm?: number | null;
    deadlift1rm?: number | null;
    ohp1rm?: number | null;
  },
) {
  const existingCycle = await getProgramCycleById(db, cycleId, userId);
  if (!existingCycle) {
    return null;
  }

  const oneRMUpdates: Record<string, number> = {};
  if (data.squat1rm != null) oneRMUpdates.squat1rm = data.squat1rm;
  if (data.bench1rm != null) oneRMUpdates.bench1rm = data.bench1rm;
  if (data.deadlift1rm != null) oneRMUpdates.deadlift1rm = data.deadlift1rm;
  if (data.ohp1rm != null) oneRMUpdates.ohp1rm = data.ohp1rm;

  return db
    .update(schema.userProgramCycles)
    .set({
      ...oneRMUpdates,
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

export async function completeProgramCycle(db: any, cycleId: string, userId: string) {
  const result = await db
    .update(schema.userProgramCycles)
    .set({
      status: 'completed',
      isComplete: true,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.userProgramCycles.id, cycleId),
        eq(schema.userProgramCycles.userId, userId),
        eq(schema.userProgramCycles.isComplete, false),
        eq(schema.userProgramCycles.status, 'active'),
      ),
    )
    .returning()
    .get();

  if (result) {
    return result;
  }

  const existingCompletedCycle = await db
    .select()
    .from(schema.userProgramCycles)
    .where(
      and(
        eq(schema.userProgramCycles.id, cycleId),
        eq(schema.userProgramCycles.userId, userId),
        eq(schema.userProgramCycles.isComplete, true),
        eq(schema.userProgramCycles.status, 'completed'),
      ),
    )
    .get();

  return existingCompletedCycle ?? null;
}

export async function createWorkoutFromProgramCycleWorkout(
  db: any,
  userId: string,
  cycleId: string,
  cycleWorkout: any,
) {
  const now = new Date();
  const workoutId = schema.generateId();

  const targetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);
  if (targetLifts.all.length === 0) {
    throw new Error(`Program cycle workout ${cycleWorkout.id} has no target lifts`);
  }

  const consolidatedTargetLifts = consolidateProgramTargetLiftsForWorkoutSections(targetLifts.all);

  const exerciseIdList: {
    workoutExerciseId: string;
    exerciseId: string;
    orderIndex: number;
    isAmrap: boolean;
    targetLift: NormalizedProgramTargetLift & { segments: NormalizedProgramTargetLift[] };
  }[] = [];

  for (let i = 0; i < consolidatedTargetLifts.length; i++) {
    const targetLift = consolidatedTargetLifts[i];
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

  const workoutValues = {
    id: workoutId,
    userId,
    programCycleId: cycleId,
    name: cycleWorkout.sessionName,
    notes: null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const workoutExerciseRows = exerciseIdList.map(
    ({ workoutExerciseId, exerciseId, orderIndex, isAmrap }) => ({
      id: workoutExerciseId,
      workoutId,
      exerciseId,
      orderIndex,
      isAmrap,
      updatedAt: now,
    }),
  );

  const allSetRows: (typeof schema.workoutSets.$inferInsert)[] = [];
  for (const { workoutExerciseId, targetLift } of exerciseIdList) {
    let nextSetNumber = 1;
    for (const segment of targetLift.segments) {
      const segmentSetCount = normalizeProgramSetCount(segment.sets, 1);
      const segmentValues = buildProgramSetValues(segment);

      const setRows = Array.from({ length: segmentSetCount }, () => ({
        workoutExerciseId,
        setNumber: nextSetNumber++,
        ...segmentValues,
        rpe: null,
        isComplete: false,
        createdAt: now,
        updatedAt: now,
      }));
      allSetRows.push(...setRows);
    }
  }

  const statements: any[] = [
    db.insert(schema.workouts).values(workoutValues).onConflictDoNothing(),
  ];

  const exerciseChunkSize = getSafeInsertChunkSize(
    workoutExerciseRows as Record<string, unknown>[],
    100,
    100,
  );
  const exerciseChunks = chunkArray(workoutExerciseRows, exerciseChunkSize);
  for (const chunk of exerciseChunks) {
    statements.push(db.insert(schema.workoutExercises).values(chunk));
  }

  if (allSetRows.length > 0) {
    const setChunkSize = getSafeInsertChunkSize(allSetRows as Record<string, unknown>[], 100, 100);
    const setChunks = chunkArray(allSetRows, setChunkSize);
    for (const chunk of setChunks) {
      statements.push(db.insert(schema.workoutSets).values(chunk));
    }
  }

  statements.push(
    db
      .update(schema.programCycleWorkouts)
      .set({
        workoutId,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.programCycleWorkouts.id, cycleWorkout.id),
          eq(schema.programCycleWorkouts.cycleId, cycleId),
        ),
      ),
  );

  await db.batch(statements);

  return workoutValues;
}

export async function startCycleWorkout(
  db: any,
  userId: string,
  cycleWorkout: { id: string; workoutId?: string | null; sessionName: string; cycleId: string },
) {
  if (cycleWorkout.workoutId) {
    const existingWorkout = await db
      .select({
        id: schema.workouts.id,
        name: schema.workouts.name,
        completedAt: schema.workouts.completedAt,
        isDeleted: schema.workouts.isDeleted,
      })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.id, cycleWorkout.workoutId),
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
        ),
      )
      .get();

    if (existingWorkout) {
      const exerciseCount = await db
        .select({ count: sql<number>`count(${schema.workoutExercises.id})` })
        .from(schema.workoutExercises)
        .where(eq(schema.workoutExercises.workoutId, existingWorkout.id))
        .get();

      if ((exerciseCount?.count ?? 0) === 0) {
        const parsedTargetLifts = parseProgramTargetLifts((cycleWorkout as any).targetLifts);
        if (parsedTargetLifts.all.length > 0) {
          const workout = await createWorkoutFromProgramCycleWorkout(
            db,
            userId,
            cycleWorkout.cycleId,
            cycleWorkout,
          );

          return {
            workoutId: workout.id,
            sessionName: workout.name,
            created: true,
            completed: false,
          };
        }
      }

      return {
        workoutId: existingWorkout.id,
        sessionName: existingWorkout.name,
        created: false,
        completed: !!existingWorkout.completedAt,
      };
    }
  }

  const workout = await createWorkoutFromProgramCycleWorkout(
    db,
    userId,
    cycleWorkout.cycleId,
    cycleWorkout,
  );

  return {
    workoutId: workout.id,
    sessionName: workout.name,
    created: true,
    completed: false,
  };
}

export async function advanceProgramCycleForWorkout(db: any, userId: string, workoutId: string) {
  const workout = await db
    .select({
      id: schema.workouts.id,
      name: schema.workouts.name,
      workoutType: schema.workouts.workoutType,
      programCycleId: schema.workouts.programCycleId,
      isDeleted: schema.workouts.isDeleted,
    })
    .from(schema.workouts)
    .where(and(eq(schema.workouts.id, workoutId), eq(schema.workouts.userId, userId)))
    .get();

  if (
    workout?.workoutType === schema.WORKOUT_TYPE_ONE_RM_TEST &&
    workout.programCycleId &&
    workout.isDeleted === false
  ) {
    await completeProgramCycle(db, workout.programCycleId, userId);
    return;
  }

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

  const updateResult = await db
    .update(schema.programCycleWorkouts)
    .set({
      isComplete: true,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.programCycleWorkouts.id, linkedCycleWorkout.id),
        eq(schema.programCycleWorkouts.isComplete, false),
      ),
    )
    .run();

  if ((updateResult.meta?.changes ?? 0) === 0) {
    return;
  }

  if (nextCycleWorkout) {
    await db
      .update(schema.userProgramCycles)
      .set({
        totalSessionsCompleted: sql`${schema.userProgramCycles.totalSessionsCompleted} + 1`,
        currentWeek: nextCycleWorkout.weekNumber,
        currentSession: nextCycleWorkout.sessionNumber,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.userProgramCycles.id, linkedCycleWorkout.cycleId),
          eq(schema.userProgramCycles.userId, userId),
        ),
      )
      .run();
  } else {
    const completed = await completeProgramCycle(db, linkedCycleWorkout.cycleId, userId);
    if (!completed) {
      return;
    }
    await db
      .update(schema.userProgramCycles)
      .set({
        totalSessionsCompleted: sql`${schema.userProgramCycles.totalSessionsCompleted} + 1`,
      })
      .where(
        and(
          eq(schema.userProgramCycles.id, linkedCycleWorkout.cycleId),
          eq(schema.userProgramCycles.userId, userId),
        ),
      )
      .run();
  }
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
      .onConflictDoNothing()
      .returning({ id: schema.exercises.id })
      .get();

    if (created) {
      return created.id;
    }

    const fallback = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(
        and(
          eq(schema.exercises.userId, userId),
          eq(schema.exercises.libraryId, libraryExercise.id),
        ),
      )
      .get();

    if (fallback) {
      return fallback.id;
    }
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
  options: { isAmrap?: boolean } = {},
) {
  const snapshots = await getLastCompletedExerciseSnapshots(db, userId, [exerciseId], options);
  return snapshots[0] ?? null;
}

export async function getLastCompletedExerciseSnapshots(
  db: any,
  userId: string,
  exerciseIds: string[],
  options: { isAmrap?: boolean } = {},
) {
  if (exerciseIds.length === 0) return [];

  const directExercises = await db
    .select({ id: schema.exercises.id, libraryId: schema.exercises.libraryId })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.userId, userId), inArray(schema.exercises.id, exerciseIds)))
    .all();

  const directMap = new Map<string, string>(
    directExercises.map((e: { id: string; libraryId: string | null }) => [e.id, e.id]),
  );
  const unresolvedIds = exerciseIds.filter((id) => !directMap.has(id));

  let libraryMap = new Map<string, string>();
  if (unresolvedIds.length > 0) {
    const byLibraryId = await db
      .select({ id: schema.exercises.id, libraryId: schema.exercises.libraryId })
      .from(schema.exercises)
      .where(
        and(
          eq(schema.exercises.userId, userId),
          inArray(schema.exercises.libraryId, unresolvedIds),
        ),
      )
      .all();
    for (const row of byLibraryId) {
      if (row.libraryId) libraryMap.set(row.libraryId, row.id);
    }
  }

  const resolvedIds: string[] = [];
  const originalToResolved = new Map<string, string>();
  for (const id of exerciseIds) {
    const resolved = directMap.get(id) ?? libraryMap.get(id);
    if (resolved) {
      resolvedIds.push(resolved);
      originalToResolved.set(id, resolved);
    }
  }

  if (resolvedIds.length === 0) return [];

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const recentRows: {
    exerciseId: string;
    workoutExerciseId: string;
    workoutCompletedAt: Date | null;
  }[] = await chunkedQueryMany(db, {
    ids: resolvedIds,
    builder: (chunk) =>
      db
        .select({
          exerciseId: schema.workoutExercises.exerciseId,
          workoutExerciseId: schema.workoutExercises.id,
          workoutCompletedAt: schema.workouts.completedAt,
        })
        .from(schema.workoutExercises)
        .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
        .where(
          and(
            inArray(schema.workoutExercises.exerciseId, chunk),
            eq(schema.workouts.userId, userId),
            eq(schema.workouts.isDeleted, false),
            eq(schema.workouts.workoutType, schema.WORKOUT_TYPE_TRAINING),
            eq(schema.workoutExercises.isDeleted, false),
            ...(options.isAmrap === undefined
              ? []
              : [eq(schema.workoutExercises.isAmrap, options.isAmrap)]),
            sql`${schema.workouts.completedAt} IS NOT NULL`,
            gte(schema.workouts.startedAt, ninetyDaysAgo),
          ),
        )
        .orderBy(desc(schema.workouts.completedAt))
        .limit(50)
        .all(),
  });

  const seen = new Set<string>();
  const latestByResolvedId = new Map<
    string,
    { workoutExerciseId: string; workoutCompletedAt: Date | null }
  >();
  for (const row of recentRows) {
    if (!seen.has(row.exerciseId)) {
      seen.add(row.exerciseId);
      latestByResolvedId.set(row.exerciseId, {
        workoutExerciseId: row.workoutExerciseId,
        workoutCompletedAt: row.workoutCompletedAt,
      });
    }
  }

  if (latestByResolvedId.size === 0) return [];

  const workoutExerciseIds = Array.from(latestByResolvedId.values()).map(
    (v) => v.workoutExerciseId,
  );
  type SetRow = {
    workoutExerciseId: string;
    weight: number | null;
    reps: number | null;
    rpe: number | null;
    duration: number | null;
    distance: number | null;
    height: number | null;
    setNumber: number | null;
  };
  const allSets: SetRow[] = await chunkedQueryMany(db, {
    ids: workoutExerciseIds,
    builder: (chunk) =>
      db
        .select({
          workoutExerciseId: schema.workoutSets.workoutExerciseId,
          weight: schema.workoutSets.weight,
          reps: schema.workoutSets.reps,
          rpe: schema.workoutSets.rpe,
          duration: schema.workoutSets.duration,
          distance: schema.workoutSets.distance,
          height: schema.workoutSets.height,
          setNumber: schema.workoutSets.setNumber,
        })
        .from(schema.workoutSets)
        .where(
          and(
            inArray(schema.workoutSets.workoutExerciseId, chunk),
            eq(schema.workoutSets.isDeleted, false),
          ),
        )
        .orderBy(schema.workoutSets.setNumber)
        .all(),
  });

  const setsByWorkoutExerciseId = new Map<string, SetRow[]>();
  for (const set of allSets) {
    const list = setsByWorkoutExerciseId.get(set.workoutExerciseId) ?? [];
    list.push(set);
    setsByWorkoutExerciseId.set(set.workoutExerciseId, list);
  }

  const results: {
    exerciseId: string;
    isAmrap?: boolean | null;
    workoutDate: string | null;
    sets: {
      weight: number | null;
      reps: number | null;
      rpe: number | null;
      duration: number | null;
      distance: number | null;
      height: number | null;
      setNumber: number | null;
    }[];
  }[] = [];
  for (const [originalId, resolvedId] of originalToResolved) {
    const latest = latestByResolvedId.get(resolvedId);
    if (latest) {
      const sets = (setsByWorkoutExerciseId.get(latest.workoutExerciseId) ?? []).map((s) => ({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
        duration: s.duration,
        distance: s.distance,
        height: s.height,
        setNumber: s.setNumber,
      }));
      results.push({
        exerciseId: originalId,
        isAmrap: options.isAmrap ?? null,
        workoutDate: latest.workoutCompletedAt
          ? new Date(latest.workoutCompletedAt).toISOString().split('T')[0]
          : null,
        sets,
      });
    }
  }

  return results;
}

/* oxlint-disable no-unused-vars */
import { eq, and, inArray, desc, sql, isNotNull } from 'drizzle-orm';
import * as schema from '@strength/db';
import {
  chunkedQuery,
  chunkedQueryMany,
  chunkedInsert,
  computePlannedSetValues,
  getOrCreateExerciseForUser,
} from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import {
  requireOwnedRecord,
  requireOwnedWorkoutExercise,
  requireOwnedWorkoutSet,
} from '../api/guards';
import {
  resolveToUserExerciseId,
  getLastCompletedExerciseSnapshot,
  getLastCompletedExerciseSnapshots,
  advanceProgramCycleForWorkout,
} from '../lib/program-helpers';
import { pickAllowedKeys } from '../lib/validation';
import { getWorkoutAggregates } from '../lib/workout-helpers';

const MAX_SYNC_COMPLETE_EXERCISES = 40;
const MAX_SYNC_COMPLETE_SETS = 400;

const router = createRouter();

function parseDateInput(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function resolveWorkoutType(input: { workoutType?: unknown; name?: unknown }) {
  if (input.workoutType === schema.WORKOUT_TYPE_ONE_RM_TEST) {
    return schema.WORKOUT_TYPE_ONE_RM_TEST;
  }
  if (input.name === '1RM Test') {
    return schema.WORKOUT_TYPE_ONE_RM_TEST;
  }
  return schema.WORKOUT_TYPE_TRAINING;
}

function buildTemplateSetValues(templateExercise: {
  exerciseType?: string | null;
  targetWeight?: number | null;
  addedWeight?: number | null;
  reps?: number | null;
  isAmrap?: boolean | null;
  targetDuration?: number | null;
  targetDistance?: number | null;
  targetHeight?: number | null;
}) {
  return computePlannedSetValues({
    exerciseType: templateExercise.exerciseType,
    targetWeight: templateExercise.targetWeight,
    addedWeight: templateExercise.addedWeight,
    reps: templateExercise.reps ?? 0,
    isAmrap: templateExercise.isAmrap,
    targetDuration: templateExercise.targetDuration,
    targetDistance: templateExercise.targetDistance,
    targetHeight: templateExercise.targetHeight,
  });
}

async function fetchWorkoutSyncSnapshot(db: any, workoutId: string) {
  const workout = await db
    .select()
    .from(schema.workouts)
    .where(eq(schema.workouts.id, workoutId))
    .get();
  const exercises = await db
    .select({
      id: schema.workoutExercises.id,
      exerciseId: schema.workoutExercises.exerciseId,
      orderIndex: schema.workoutExercises.orderIndex,
      notes: schema.workoutExercises.notes,
      isAmrap: schema.workoutExercises.isAmrap,
      name: schema.exercises.name,
      muscleGroup: schema.exercises.muscleGroup,
      libraryId: schema.exercises.libraryId,
      exerciseType: schema.exercises.exerciseType,
    })
    .from(schema.workoutExercises)
    .innerJoin(schema.exercises, eq(schema.workoutExercises.exerciseId, schema.exercises.id))
    .where(eq(schema.workoutExercises.workoutId, workoutId))
    .orderBy(schema.workoutExercises.orderIndex)
    .all();
  const exerciseIds = exercises.map((exercise: any) => exercise.id);
  const sets =
    exerciseIds.length > 0
      ? await chunkedQueryMany(db, {
          ids: exerciseIds,
          builder: (chunk) =>
            db
              .select()
              .from(schema.workoutSets)
              .where(inArray(schema.workoutSets.workoutExerciseId, chunk))
              .orderBy(schema.workoutSets.setNumber)
              .all(),
        })
      : [];

  return { workout, exercises, sets };
}

function buildWorkoutSyncResponse(snapshot: any) {
  return {
    workout: snapshot.workout,
    exercises: snapshot.exercises,
    sets: snapshot.sets,
  };
}

router.get(
  '/',
  createHandler(async (c, { userId, db }) => {
    const rawLimit = parseInt(c.req.query('limit') || '10', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;
    const includeActive = c.req.query('includeActive') === 'true';
    const results = await db
      .select({
        id: schema.workouts.id,
        workoutType: schema.workouts.workoutType,
        name: schema.workouts.name,
        notes: schema.workouts.notes,
        startedAt: schema.workouts.startedAt,
        completedAt: schema.workouts.completedAt,
        createdAt: schema.workouts.createdAt,
        totalVolume: schema.workouts.totalVolume,
        totalSets: schema.workouts.totalSets,
        durationMinutes: schema.workouts.durationMinutes,
      })
      .from(schema.workouts)
      .where(
        and(
          eq(schema.workouts.userId, userId),
          eq(schema.workouts.isDeleted, false),
          ...(includeActive ? [] : [isNotNull(schema.workouts.completedAt)]),
        ),
      )
      .orderBy(desc(schema.workouts.startedAt))
      .limit(limit)
      .all();

    const workoutIds = results.map((w) => w.id);
    if (workoutIds.length === 0) {
      return c.json(results.map((w) => ({ ...w, exerciseCount: 0 })));
    }

    const exerciseCounts = await chunkedQuery(db, {
      ids: workoutIds,
      mergeKey: 'workoutId',
      builder: (chunk) =>
        db
          .select({
            workoutId: schema.workoutExercises.workoutId,
            exerciseCount: sql<number>`count(${schema.workoutExercises.id})`,
          })
          .from(schema.workoutExercises)
          .where(inArray(schema.workoutExercises.workoutId, chunk))
          .groupBy(schema.workoutExercises.workoutId)
          .all(),
    });

    const exerciseCountMap = new Map(exerciseCounts.map((ec) => [ec.workoutId, ec.exerciseCount]));

    return c.json(
      results.map((w) => ({
        ...w,
        exerciseCount: exerciseCountMap.get(w.id) ?? 0,
      })),
    );
  }),
);

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    const body = await c.req.json();
    const { name, templateId, notes } = body;
    if (!name) {
      return c.json({ message: 'Name is required' }, 400);
    }

    const now = new Date();
    if (templateId) {
      const { requireOwnedRecord: requireOwnedTemplate } = await import('../api/guards');
      const template = await requireOwnedTemplate({ userId, db }, schema.templates, templateId, {
        extraConditions: [eq(schema.templates.isDeleted, false)],
        notFoundBody: { message: 'Template not found' },
      });
      if (template instanceof Response) return template;
      // Template isDeleted=false already verified by requireOwnedRecord above.
    }

    const workout = await db
      .insert(schema.workouts)
      .values({
        userId,
        name,
        workoutType: schema.WORKOUT_TYPE_TRAINING,
        templateId: templateId || null,
        notes: notes || null,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (templateId) {
      const templateExercisesResult = await db
        .select()
        .from(schema.templateExercises)
        .where(eq(schema.templateExercises.templateId, templateId))
        .orderBy(schema.templateExercises.orderIndex)
        .all();

      const exerciseIds = templateExercisesResult.map((te) => te.exerciseId);
      type Snapshot = {
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
      };
      const unfilteredHistorySnapshots = await getLastCompletedExerciseSnapshots(
        db,
        userId,
        exerciseIds,
      );
      const filteredHistorySnapshots = await Promise.all(
        [false, true].map((isAmrap) =>
          getLastCompletedExerciseSnapshots(db, userId, exerciseIds, { isAmrap }),
        ),
      );
      const snapshotByExerciseId = new Map<string, Snapshot>();
      for (const snapshot of unfilteredHistorySnapshots) {
        snapshotByExerciseId.set(snapshot.exerciseId, snapshot);
      }
      const snapshotByExerciseAndAmrap = new Map<string, Snapshot>();
      for (const snapshot of filteredHistorySnapshots.flat()) {
        snapshotByExerciseAndAmrap.set(
          `${snapshot.exerciseId}:${Boolean(snapshot.isAmrap)}`,
          snapshot,
        );
      }

      const workoutExerciseRows = templateExercisesResult.map((templateExercise, i) => ({
        id: schema.generateId(),
        workoutId: workout.id,
        exerciseId: templateExercise.exerciseId,
        orderIndex: i,
        isAmrap: templateExercise.isAmrap ?? false,
        updatedAt: now,
      }));

      await chunkedInsert(db, { table: schema.workoutExercises, rows: workoutExerciseRows });

      const allSetRows: (typeof schema.workoutSets.$inferInsert)[] = [];
      for (let i = 0; i < templateExercisesResult.length; i++) {
        const templateExercise = templateExercisesResult[i];
        const workoutExerciseId = workoutExerciseRows[i].id;
        const isAmrap = Boolean(templateExercise.isAmrap);
        const historySnapshot =
          snapshotByExerciseAndAmrap.get(`${templateExercise.exerciseId}:${isAmrap}`) ??
          snapshotByExerciseId.get(templateExercise.exerciseId);

        const historySets = isAmrap
          ? (historySnapshot?.sets ?? []).slice(0, 1)
          : historySnapshot?.sets;
        const historySetCount = historySets?.length ?? 0;
        const plannedSetCount = isAmrap
          ? 1
          : Math.max(
              1,
              templateExercise.sets ??
                ((templateExercise.exerciseType ?? 'weights') === 'cardio' ||
                (templateExercise.exerciseType ?? 'weights') === 'timed'
                  ? 1
                  : 3),
            );
        const setCount = isAmrap ? 1 : Math.max(plannedSetCount, historySetCount);
        const setRows = Array.from({ length: setCount }, (_, s) => {
          const historySet = historySets?.[s];
          const planned = buildTemplateSetValues(templateExercise);
          return {
            workoutExerciseId,
            setNumber: s + 1,
            weight: historySet?.weight ?? planned.weight,
            reps: historySet?.reps ?? planned.reps,
            duration: historySet?.duration ?? planned.duration,
            distance: historySet?.distance ?? planned.distance,
            height: historySet?.height ?? planned.height,
            rpe: historySet?.rpe ?? null,
            isComplete: false,
            createdAt: now,
            updatedAt: now,
          };
        });

        allSetRows.push(...setRows);
      }

      if (allSetRows.length > 0) {
        await chunkedInsert(db, { table: schema.workoutSets, rows: allSetRows });
      }
    }
    return c.json(workout, 201);
  }),
);

router.get(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const workout = await requireOwnedRecord({ userId, db }, schema.workouts, id, {
      extraConditions: [eq(schema.workouts.isDeleted, false)],
      notFoundBody: { message: 'Workout not found' },
    });
    if (workout instanceof Response) return workout;
    const aggregates = await getWorkoutAggregates(db, id);
    const exercisesResult = await db
      .select({
        id: schema.workoutExercises.id,
        exerciseId: schema.workoutExercises.exerciseId,
        orderIndex: schema.workoutExercises.orderIndex,
        notes: schema.workoutExercises.notes,
        isAmrap: schema.workoutExercises.isAmrap,
        name: schema.exercises.name,
        muscleGroup: schema.exercises.muscleGroup,
        libraryId: schema.exercises.libraryId,
        exerciseType: schema.exercises.exerciseType,
      })
      .from(schema.workoutExercises)
      .innerJoin(schema.exercises, eq(schema.workoutExercises.exerciseId, schema.exercises.id))
      .where(eq(schema.workoutExercises.workoutId, id))
      .orderBy(schema.workoutExercises.orderIndex)
      .all();

    const exerciseIds = exercisesResult.map((e: any) => e.id);
    const allSets = await chunkedQueryMany(db, {
      ids: exerciseIds,
      chunkSize: 100,
      builder: (chunk) =>
        db
          .select({
            id: schema.workoutSets.id,
            workoutExerciseId: schema.workoutSets.workoutExerciseId,
            setNumber: schema.workoutSets.setNumber,
            weight: schema.workoutSets.weight,
            reps: schema.workoutSets.reps,
            duration: schema.workoutSets.duration,
            distance: schema.workoutSets.distance,
            height: schema.workoutSets.height,
            rpe: schema.workoutSets.rpe,
            isComplete: schema.workoutSets.isComplete,
            completedAt: schema.workoutSets.completedAt,
            createdAt: schema.workoutSets.createdAt,
          })
          .from(schema.workoutSets)
          .where(inArray(schema.workoutSets.workoutExerciseId, chunk))
          .orderBy(schema.workoutSets.setNumber)
          .all(),
    });

    const setsByExerciseId = new Map<string, typeof allSets>();
    for (const set of allSets) {
      const eid = set.workoutExerciseId as string;
      if (!setsByExerciseId.has(eid)) setsByExerciseId.set(eid, []);
      setsByExerciseId.get(eid)!.push(set);
    }

    const exercisesWithSets = exercisesResult.map((e: any) => ({
      ...e,
      sets: setsByExerciseId.get(e.id) ?? [],
    }));

    return c.json({
      ...workout,
      totalVolume: aggregates?.totalVolume ?? 0,
      totalSets: aggregates?.totalSets ?? 0,
      durationMinutes: workout.durationMinutes ?? 0,
      exerciseCount: aggregates?.exerciseCount ?? 0,
      exercises: exercisesWithSets,
    });
  }),
);

router.put(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const body = await c.req.json();
    const allowed = pickAllowedKeys(body, [
      'name',
      'notes',
      'startedAt',
      'completedAt',
      'totalVolume',
      'totalSets',
      'durationMinutes',
    ]);
    const result = await db
      .update(schema.workouts)
      .set({ ...allowed, updatedAt: new Date() })
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .returning()
      .get();
    if (!result) {
      return c.json({ message: 'Workout not found' }, 404);
    }
    return c.json(result);
  }),
);

router.delete(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const now = new Date();
    const result = await db
      .update(schema.workouts)
      .set({ isDeleted: true, updatedAt: now })
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .run();

    await db
      .update(schema.programCycleWorkouts)
      .set({
        workoutId: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.programCycleWorkouts.workoutId, id),
          inArray(
            schema.programCycleWorkouts.cycleId,
            db
              .select({ id: schema.userProgramCycles.id })
              .from(schema.userProgramCycles)
              .where(eq(schema.userProgramCycles.userId, userId)),
          ),
        ),
      )
      .run();

    await db
      .update(schema.workoutExercises)
      .set({ isDeleted: true, updatedAt: now })
      .where(eq(schema.workoutExercises.workoutId, id))
      .run();

    await db
      .update(schema.workoutSets)
      .set({ isDeleted: true, updatedAt: now })
      .where(
        inArray(
          schema.workoutSets.workoutExerciseId,
          db
            .select({ id: schema.workoutExercises.id })
            .from(schema.workoutExercises)
            .where(eq(schema.workoutExercises.workoutId, id)),
        ),
      )
      .run();

    return c.json({ success: result.success });
  }),
);

router.post(
  '/:id/sync-complete',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;

    const body = await c.req.json();
    const syncOperationId = typeof body.syncOperationId === 'string' ? body.syncOperationId : '';
    const workoutInput = body.workout ?? {};
    const exerciseInputs = Array.isArray(body.exercises) ? body.exercises : [];
    const setInputs = Array.isArray(body.sets) ? body.sets : [];

    if (!syncOperationId || workoutInput.id !== id) {
      return c.json({ message: 'Invalid sync payload' }, 400);
    }
    if (
      exerciseInputs.length > MAX_SYNC_COMPLETE_EXERCISES ||
      setInputs.length > MAX_SYNC_COMPLETE_SETS
    ) {
      return c.json(
        {
          message: 'Sync payload is too large',
          limits: {
            exercises: MAX_SYNC_COMPLETE_EXERCISES,
            sets: MAX_SYNC_COMPLETE_SETS,
          },
        },
        413,
      );
    }

    const syncInsertResult = await db
      .insert(schema.workoutSyncOperations)
      .values({
        id: syncOperationId,
        userId,
        workoutId: id,
        status: 'applied',
        requestHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing()
      .run();

    console.info('[workout-sync] sync operation write attempted', {
      userId,
      workoutId: id,
      syncOperationId,
      changes: syncInsertResult.meta?.changes ?? null,
      exerciseCount: exerciseInputs.length,
      setCount: setInputs.length,
    });

    if ((syncInsertResult.meta?.changes ?? 0) === 0) {
      const existingOperation = await db
        .select()
        .from(schema.workoutSyncOperations)
        .where(
          and(
            eq(schema.workoutSyncOperations.id, syncOperationId),
            eq(schema.workoutSyncOperations.userId, userId),
          ),
        )
        .get();
      if (existingOperation) {
        const snapshot = await fetchWorkoutSyncSnapshot(db, existingOperation.workoutId);
        console.info('[workout-sync] duplicate sync operation returned existing D1 snapshot', {
          userId,
          workoutId: existingOperation.workoutId,
          syncOperationId,
          completedAt: snapshot.workout?.completedAt ?? null,
          exerciseCount: snapshot.exercises.length,
          setCount: snapshot.sets.length,
        });
        return c.json(buildWorkoutSyncResponse(snapshot));
      }
    }

    const existingWorkout = await db
      .select()
      .from(schema.workouts)
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .get();

    if (existingWorkout?.isDeleted) {
      return c.json({ message: 'Workout was deleted on the server', code: 'deleted' }, 409);
    }

    if (existingWorkout?.completedAt) {
      return c.json(
        { message: 'Workout is already completed on the server', code: 'completed' },
        409,
      );
    }

    if (workoutInput.templateId) {
      const template = await db
        .select({ id: schema.templates.id })
        .from(schema.templates)
        .where(
          and(
            eq(schema.templates.id, workoutInput.templateId),
            eq(schema.templates.userId, userId),
            eq(schema.templates.isDeleted, false),
          ),
        )
        .get();
      if (!template) {
        return c.json({ message: 'Template not found', code: 'template_not_found' }, 409);
      }
    }

    if (workoutInput.programCycleId) {
      const cycle = await db
        .select({ id: schema.userProgramCycles.id })
        .from(schema.userProgramCycles)
        .where(
          and(
            eq(schema.userProgramCycles.id, workoutInput.programCycleId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .get();
      if (!cycle) {
        return c.json({ message: 'Program cycle not found', code: 'cycle_not_found' }, 409);
      }
    }

    const startedAt = parseDateInput(workoutInput.startedAt);
    const completedAt = parseDateInput(workoutInput.completedAt) ?? new Date();
    if (!startedAt || typeof workoutInput.name !== 'string' || workoutInput.name.trim() === '') {
      return c.json({ message: 'Invalid workout data' }, 400);
    }

    const now = new Date();
    const workoutValues = {
      id,
      userId,
      templateId: workoutInput.templateId ?? null,
      programCycleId: workoutInput.programCycleId ?? null,
      workoutType: resolveWorkoutType(workoutInput),
      name: workoutInput.name.trim(),
      notes: workoutInput.notes ?? null,
      startedAt,
      createdAt: existingWorkout?.createdAt ?? startedAt,
      updatedAt: now,
    };

    if (!existingWorkout) {
      await db.insert(schema.workouts).values(workoutValues).run();
      console.info('[workout-sync] workout row inserted', {
        userId,
        workoutId: id,
        syncOperationId,
        workoutType: workoutValues.workoutType,
        startedAt: startedAt.toISOString(),
      });
    } else {
      await db
        .update(schema.workouts)
        .set({
          templateId: workoutValues.templateId,
          programCycleId: workoutValues.programCycleId,
          workoutType: workoutValues.workoutType,
          name: workoutValues.name,
          notes: workoutValues.notes,
          startedAt,
          updatedAt: now,
        })
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .run();
      console.info('[workout-sync] workout row updated', {
        userId,
        workoutId: id,
        syncOperationId,
        workoutType: workoutValues.workoutType,
        startedAt: startedAt.toISOString(),
      });
    }

    const existingExercises = await db
      .select({ id: schema.workoutExercises.id })
      .from(schema.workoutExercises)
      .where(eq(schema.workoutExercises.workoutId, id))
      .all();
    const existingExerciseIds = existingExercises.map((exercise) => exercise.id);
    if (existingExerciseIds.length > 0) {
      await db
        .delete(schema.workoutSets)
        .where(inArray(schema.workoutSets.workoutExerciseId, existingExerciseIds))
        .run();
      await db
        .delete(schema.workoutExercises)
        .where(eq(schema.workoutExercises.workoutId, id))
        .run();
      console.info('[workout-sync] replaced existing workout child rows', {
        userId,
        workoutId: id,
        syncOperationId,
        deletedExerciseCount: existingExerciseIds.length,
      });
    }

    // Validate exercise input shape first
    for (const exercise of exerciseInputs) {
      if (!exercise?.id || !exercise.exerciseId || exercise.orderIndex === undefined) {
        return c.json({ message: 'Invalid exercise data' }, 400);
      }
    }

    // Batch ownership check: one query instead of one per exercise
    const allExerciseIds = exerciseInputs.map((exercise: any) => exercise.exerciseId);
    const ownedExercises = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(
        and(
          inArray(schema.exercises.id, allExerciseIds),
          eq(schema.exercises.userId, userId),
          eq(schema.exercises.isDeleted, false),
        ),
      )
      .all();

    const ownedSet = new Set(ownedExercises.map((exercise) => exercise.id));

    const resolvedExerciseRows: (typeof schema.workoutExercises.$inferInsert)[] = [];
    for (const exercise of exerciseInputs) {
      let resolvedExerciseId = exercise.exerciseId;

      if (!ownedSet.has(resolvedExerciseId)) {
        if (exercise.libraryId || exercise.name) {
          resolvedExerciseId = await getOrCreateExerciseForUser(
            db,
            userId,
            exercise.name ?? 'Exercise',
            undefined,
            exercise.libraryId,
          );
        } else {
          resolvedExerciseId = await resolveToUserExerciseId(db, userId, exercise.exerciseId);
        }
      }

      resolvedExerciseRows.push({
        id: exercise.id,
        workoutId: id,
        exerciseId: resolvedExerciseId,
        orderIndex: exercise.orderIndex,
        notes: exercise.notes ?? null,
        isAmrap: exercise.isAmrap ?? false,
        updatedAt: now,
      });
    }

    if (resolvedExerciseRows.length > 0) {
      const resolvedExerciseIds = resolvedExerciseRows.map((row) => row.exerciseId);
      const softDeletedExercises = await db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(
          and(
            inArray(schema.exercises.id, resolvedExerciseIds),
            eq(schema.exercises.isDeleted, true),
          ),
        )
        .all();
      if (softDeletedExercises.length > 0) {
        return c.json({ message: 'One or more exercises have been deleted' }, 400);
      }
    }

    await chunkedInsert(db, { table: schema.workoutExercises, rows: resolvedExerciseRows });
    console.info('[workout-sync] workout exercise rows written', {
      userId,
      workoutId: id,
      syncOperationId,
      exerciseCount: resolvedExerciseRows.length,
    });

    const exerciseIdSet = new Set(resolvedExerciseRows.map((exercise) => exercise.id));
    const setRows: (typeof schema.workoutSets.$inferInsert)[] = [];
    let totalSets = 0;
    let totalVolume = 0;

    for (const set of setInputs) {
      if (!set?.id || !exerciseIdSet.has(set.workoutExerciseId) || set.setNumber === undefined) {
        return c.json({ message: 'Invalid set data' }, 400);
      }

      const isComplete = set.isComplete === true;
      if (isComplete) {
        totalSets++;
        if (typeof set.weight === 'number' && typeof set.reps === 'number') {
          totalVolume += set.weight * set.reps;
        }
      }

      setRows.push({
        id: set.id,
        workoutExerciseId: set.workoutExerciseId,
        setNumber: set.setNumber,
        weight: set.weight ?? null,
        reps: set.reps ?? null,
        duration: set.duration ?? null,
        distance: set.distance ?? null,
        height: set.height ?? null,
        rpe: set.rpe ?? null,
        isComplete,
        completedAt: isComplete ? (parseDateInput(set.completedAt) ?? completedAt) : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await chunkedInsert(db, { table: schema.workoutSets, rows: setRows });
    console.info('[workout-sync] workout set rows written', {
      userId,
      workoutId: id,
      syncOperationId,
      setCount: setRows.length,
      completedSetCount: totalSets,
      totalVolume,
    });

    const elapsedMs = completedAt.getTime() - startedAt.getTime();
    const rawMinutes = Math.round(elapsedMs / 60000);
    const durationMinutes = rawMinutes > 0 && rawMinutes <= 1440 ? rawMinutes : null;

    await db
      .update(schema.workouts)
      .set({
        completedAt,
        totalVolume,
        totalSets,
        durationMinutes,
        updatedAt: now,
      })
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .run();
    console.info('[workout-sync] workout completion written to D1', {
      userId,
      workoutId: id,
      syncOperationId,
      completedAt: completedAt.toISOString(),
      totalSets,
      totalVolume,
      durationMinutes,
    });

    if (workoutInput.cycleWorkoutId) {
      const ownedCycleWorkout = await db
        .select({ id: schema.programCycleWorkouts.id })
        .from(schema.programCycleWorkouts)
        .innerJoin(
          schema.userProgramCycles,
          eq(schema.programCycleWorkouts.cycleId, schema.userProgramCycles.id),
        )
        .where(
          and(
            eq(schema.programCycleWorkouts.id, workoutInput.cycleWorkoutId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .get();

      if (ownedCycleWorkout) {
        await db
          .update(schema.programCycleWorkouts)
          .set({ workoutId: id, updatedAt: now })
          .where(eq(schema.programCycleWorkouts.id, workoutInput.cycleWorkoutId))
          .run();
        console.info('[workout-sync] program cycle workout linked', {
          userId,
          workoutId: id,
          syncOperationId,
          cycleWorkoutId: workoutInput.cycleWorkoutId,
        });
      }
    }

    await advanceProgramCycleForWorkout(db, userId, id);

    const snapshot = await fetchWorkoutSyncSnapshot(db, id);
    console.info('[workout-sync] sync-complete response snapshot loaded from D1', {
      userId,
      workoutId: id,
      syncOperationId,
      completedAt: snapshot.workout?.completedAt ?? null,
      exerciseCount: snapshot.exercises.length,
      setCount: snapshot.sets.length,
    });
    let programAdvance: Record<string, unknown> | undefined;
    if (workoutInput.programCycleId) {
      const cycle = await db
        .select({
          id: schema.userProgramCycles.id,
          currentWeek: schema.userProgramCycles.currentWeek,
          currentSession: schema.userProgramCycles.currentSession,
          status: schema.userProgramCycles.status,
        })
        .from(schema.userProgramCycles)
        .where(
          and(
            eq(schema.userProgramCycles.id, workoutInput.programCycleId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .get();
      programAdvance = cycle
        ? {
            programCycleId: cycle.id,
            completedCycleWorkoutId: workoutInput.cycleWorkoutId ?? undefined,
            currentWeek: cycle.currentWeek,
            currentSession: cycle.currentSession,
            status: cycle.status,
          }
        : undefined;
    }

    return c.json({ ...buildWorkoutSyncResponse(snapshot), programAdvance });
  }),
);

router.put(
  '/:id/complete',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const workout = await db
      .select({ startedAt: schema.workouts.startedAt, completedAt: schema.workouts.completedAt })
      .from(schema.workouts)
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }
    if (workout.completedAt) {
      return c.json({ message: 'Workout already completed' }, 409);
    }
    const now = new Date();
    const aggregates = await getWorkoutAggregates(db, id);
    const elapsedMs = now.getTime() - new Date(workout.startedAt).getTime();
    const rawMinutes = Math.round(elapsedMs / 60000);
    const durationMinutes = rawMinutes > 0 && rawMinutes <= 1440 ? rawMinutes : null;
    const result = await db
      .update(schema.workouts)
      .set({
        completedAt: now,
        totalVolume: aggregates?.totalVolume ?? 0,
        totalSets: aggregates?.totalSets ?? 0,
        durationMinutes,
        updatedAt: now,
      })
      .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
      .returning()
      .get();

    await advanceProgramCycleForWorkout(db, userId, id);

    return c.json({ ...result, exerciseCount: aggregates?.exerciseCount ?? 0 });
  }),
);

router.post(
  '/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const workout = await requireOwnedRecord({ userId, db }, schema.workouts, id, {
      extraConditions: [eq(schema.workouts.isDeleted, false)],
      notFoundBody: { message: 'Workout not found' },
    });
    if (workout instanceof Response) return workout;
    // Parent workout isDeleted=false already verified by requireOwnedRecord above.
    const body = await c.req.json();
    const { exerciseId, orderIndex } = body;
    if (!exerciseId || orderIndex === undefined) {
      return c.json({ message: 'exerciseId and orderIndex are required' }, 400);
    }
    const resolvedExerciseId = await resolveToUserExerciseId(db, userId, exerciseId);
    const now = new Date();
    const result = await db
      .insert(schema.workoutExercises)
      .values({
        workoutId: id,
        exerciseId: resolvedExerciseId,
        orderIndex,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

router.delete(
  '/:id/exercises/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, exerciseId } = c.req.param();
    const workout = await requireOwnedRecord({ userId, db }, schema.workouts, id, {
      extraConditions: [eq(schema.workouts.isDeleted, false)],
      notFoundBody: { message: 'Workout not found' },
    });
    if (workout instanceof Response) return workout;
    const result = await db
      .delete(schema.workoutExercises)
      .where(
        and(
          eq(schema.workoutExercises.workoutId, id),
          eq(schema.workoutExercises.exerciseId, exerciseId),
        ),
      )
      .run();
    return c.json({ success: result.success });
  }),
);

router.post(
  '/sets',
  createHandler(async (c, { userId, db }) => {
    const body = await c.req.json();
    const {
      workoutExerciseId,
      setNumber,
      weight,
      reps,
      duration,
      distance,
      height,
      rpe,
      isComplete,
    } = body;
    if (!workoutExerciseId || setNumber === undefined) {
      return c.json({ message: 'workoutExerciseId and setNumber are required' }, 400);
    }
    const we = await requireOwnedWorkoutExercise({ userId, db }, workoutExerciseId);
    if (we instanceof Response) return we;

    const now = new Date();
    const result = await db
      .insert(schema.workoutSets)
      .values({
        workoutExerciseId,
        setNumber,
        weight: weight || null,
        reps: reps || null,
        duration: duration ?? null,
        distance: distance ?? null,
        height: height ?? null,
        rpe: rpe || null,
        isComplete: isComplete || false,
        ...(isComplete ? { completedAt: now } : {}),
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

router.put(
  '/sets/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const set = await requireOwnedWorkoutSet({ userId, db }, id);
    if (set instanceof Response) return set;
    const body = await c.req.json();
    const allowed = pickAllowedKeys(body, [
      'setNumber',
      'weight',
      'reps',
      'duration',
      'distance',
      'height',
      'rpe',
      'isComplete',
    ]);
    const updateData: any = { ...allowed, updatedAt: new Date() };
    if (body.isComplete === true) {
      updateData.completedAt = new Date();
    } else if (body.isComplete === false) {
      updateData.completedAt = null;
    }
    const result = await db
      .update(schema.workoutSets)
      .set(updateData)
      .where(eq(schema.workoutSets.id, id))
      .returning()
      .get();
    return c.json(result);
  }),
);

router.delete(
  '/sets/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const set = await requireOwnedWorkoutSet({ userId, db }, id);
    if (set instanceof Response) return set;
    const result = await db.delete(schema.workoutSets).where(eq(schema.workoutSets.id, id)).run();
    return c.json({ success: result.success });
  }),
);

router.get(
  '/last/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const exerciseId = c.req.param('exerciseId') as string;
    const exerciseName = c.req.query('name')?.trim();
    const isAmrapParam = c.req.query('isAmrap');
    const historyOptions =
      isAmrapParam === 'true'
        ? { isAmrap: true }
        : isAmrapParam === 'false'
          ? { isAmrap: false }
          : {};
    let snapshot = await getLastCompletedExerciseSnapshot(db, userId, exerciseId, historyOptions);

    if (!snapshot && exerciseName) {
      const matchingExercises = await db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(
          and(
            eq(schema.exercises.userId, userId),
            eq(schema.exercises.isDeleted, false),
            sql`lower(${schema.exercises.name}) = ${exerciseName.toLowerCase()}`,
          ),
        )
        .all();
      const matchingIds = matchingExercises.map((exercise: { id: string }) => exercise.id);
      const snapshots = await getLastCompletedExerciseSnapshots(
        db,
        userId,
        matchingIds,
        historyOptions,
      );
      snapshot = snapshots[0] ?? null;
    }

    if (!snapshot) {
      return c.json(null);
    }

    return c.json({
      exerciseId,
      isAmrap: snapshot.isAmrap ?? null,
      workoutDate: snapshot.workoutDate,
      sets: snapshot.sets.map(
        (set: { weight: number | null; reps: number | null; rpe: number | null }) => ({
          weight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
        }),
      ),
    });
  }),
);

export default router;

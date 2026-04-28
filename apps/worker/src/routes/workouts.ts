import { eq, and, inArray, desc, sql } from 'drizzle-orm';
import * as schema from '@strength/db';
import { chunkedQuery, chunkedQueryMany, chunkedInsert } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import {
  requireOwnedWorkout,
  requireOwnedWorkoutExercise,
  requireOwnedWorkoutSet,
} from '../api/guards';
import {
  resolveToUserExerciseId,
  getLastCompletedExerciseSnapshot,
  advanceProgramCycleForWorkout,
} from '../lib/program-helpers';

const router = createRouter();

router.get(
  '/',
  createHandler(async (c, { userId, db }) => {
    const limit = parseInt(c.req.query('limit') || '10', 10);
    try {
      const results = await db
        .select({
          id: schema.workouts.id,
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
        .where(and(eq(schema.workouts.userId, userId), eq(schema.workouts.isDeleted, false)))
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

      const exerciseCountMap = new Map(
        exerciseCounts.map((ec) => [ec.workoutId, ec.exerciseCount]),
      );

      return c.json(
        results.map((w) => ({
          ...w,
          exerciseCount: exerciseCountMap.get(w.id) ?? 0,
        })),
      );
    } catch (_e) {
      return c.json({ message: 'Failed to fetch workouts' }, 500);
    }
  }),
);

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { name, templateId, notes } = body;
      if (!name) {
        return c.json({ message: 'Name is required' }, 400);
      }

      const now = new Date();
      if (templateId) {
        const { requireOwnedTemplate } = await import('../api/guards');
        const template = await requireOwnedTemplate({ userId, db }, templateId);
        if (template instanceof Response) return template;
      }

      const workout = await db
        .insert(schema.workouts)
        .values({
          userId,
          name,
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
        for (let i = 0; i < templateExercisesResult.length; i++) {
          const templateExercise = templateExercisesResult[i];
          const workoutExercise = await db
            .insert(schema.workoutExercises)
            .values({
              workoutId: workout.id,
              exerciseId: templateExercise.exerciseId,
              orderIndex: i,
              isAmrap: templateExercise.isAmrap ?? false,
              updatedAt: now,
            })
            .returning()
            .get();
          const historySnapshot = await getLastCompletedExerciseSnapshot(
            db,
            userId,
            templateExercise.exerciseId,
          );

          const setRows =
            historySnapshot && historySnapshot.sets.length > 0
              ? historySnapshot.sets.map(
                  (
                    set: { weight: number | null; reps: number | null; rpe: number | null },
                    index: number,
                  ) => ({
                    workoutExerciseId: workoutExercise.id,
                    setNumber: index + 1,
                    weight: set.weight,
                    reps: set.reps,
                    rpe: set.rpe,
                    isComplete: false,
                    createdAt: now,
                    updatedAt: now,
                  }),
                )
              : Array.from({ length: templateExercise.sets ?? 3 }, (_, s) => ({
                  workoutExerciseId: workoutExercise.id,
                  setNumber: s + 1,
                  weight:
                    (templateExercise.targetWeight ?? 0) + (templateExercise.addedWeight ?? 0),
                  reps: templateExercise.isAmrap ? null : (templateExercise.reps ?? 0),
                  isComplete: false,
                  createdAt: now,
                  updatedAt: now,
                }));

          await chunkedInsert(db, { table: schema.workoutSets, rows: setRows });
        }
      }
      return c.json(workout, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to create workout' }, 500);
    }
  }),
);

router.get(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const workout = await requireOwnedWorkout({ userId, db }, id);
      if (workout instanceof Response) return workout;
      const aggregates = await db
        .select({
          totalSets: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSets.isComplete} = 1 THEN 1 ELSE 0 END), 0)`,
          totalVolume: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSets.isComplete} = 1 AND ${schema.workoutSets.weight} > 0 THEN ${schema.workoutSets.weight} * ${schema.workoutSets.reps} ELSE 0 END), 0)`,
          exerciseCount: sql<number>`COUNT(DISTINCT ${schema.workoutExercises.id})`,
        })
        .from(schema.workoutExercises)
        .leftJoin(
          schema.workoutSets,
          eq(schema.workoutExercises.id, schema.workoutSets.workoutExerciseId),
        )
        .where(eq(schema.workoutExercises.workoutId, id))
        .get();
      const exercisesResult = await db
        .select({
          id: schema.workoutExercises.id,
          exerciseId: schema.workoutExercises.exerciseId,
          orderIndex: schema.workoutExercises.orderIndex,
          notes: schema.workoutExercises.notes,
          isAmrap: schema.workoutExercises.isAmrap,
          name: schema.exercises.name,
          muscleGroup: schema.exercises.muscleGroup,
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
    } catch (_e) {
      return c.json({ message: 'Failed to fetch workout' }, 500);
    }
  }),
);

router.put(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const body = await c.req.json();
      const result = await db
        .update(schema.workouts)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .returning()
        .get();
      if (!result) {
        return c.json({ message: 'Workout not found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update workout' }, 500);
    }
  }),
);

router.delete(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
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
        .where(eq(schema.programCycleWorkouts.workoutId, id))
        .run();

      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to delete workout' }, 500);
    }
  }),
);

router.put(
  '/:id/complete',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const workout = await db
        .select({ startedAt: schema.workouts.startedAt })
        .from(schema.workouts)
        .where(and(eq(schema.workouts.id, id), eq(schema.workouts.userId, userId)))
        .get();
      if (!workout) {
        return c.json({ message: 'Workout not found' }, 404);
      }
      const now = new Date();
      const aggregates = await db
        .select({
          totalSets: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSets.isComplete} = 1 THEN 1 ELSE 0 END), 0)`,
          totalVolume: sql<number>`COALESCE(SUM(CASE WHEN ${schema.workoutSets.isComplete} = 1 AND ${schema.workoutSets.weight} > 0 THEN ${schema.workoutSets.weight} * ${schema.workoutSets.reps} ELSE 0 END), 0)`,
          exerciseCount: sql<number>`COUNT(DISTINCT ${schema.workoutExercises.id})`,
        })
        .from(schema.workoutExercises)
        .leftJoin(
          schema.workoutSets,
          eq(schema.workoutExercises.id, schema.workoutSets.workoutExerciseId),
        )
        .where(eq(schema.workoutExercises.workoutId, id))
        .get();
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
    } catch (_e) {
      return c.json({ message: 'Failed to complete workout' }, 500);
    }
  }),
);

router.post(
  '/:id/exercises',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const workout = await requireOwnedWorkout({ userId, db }, id);
      if (workout instanceof Response) return workout;
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
    } catch (_e) {
      return c.json({ message: 'Failed to add exercise to workout' }, 500);
    }
  }),
);

router.delete(
  '/:id/exercises/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const { id, exerciseId } = c.req.param();
    try {
      const workout = await requireOwnedWorkout({ userId, db }, id);
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
    } catch (_e) {
      return c.json({ message: 'Failed to remove exercise from workout' }, 500);
    }
  }),
);

router.post(
  '/sets',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { workoutExerciseId, setNumber, weight, reps, rpe, isComplete } = body;
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
          rpe: rpe || null,
          isComplete: isComplete || false,
          ...(isComplete ? { completedAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      return c.json(result, 201);
    } catch (_e) {
      return c.json({ message: 'Failed to create set' }, 500);
    }
  }),
);

router.put(
  '/sets/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const set = await requireOwnedWorkoutSet({ userId, db }, id);
      if (set instanceof Response) return set;
      const body = await c.req.json();
      const updateData: any = { ...body, updatedAt: new Date() };
      if (body.isComplete === true) {
        updateData.completedAt = new Date();
      } else if (body.isComplete === false) {
        updateData.completedAt = null;
      }
      delete updateData.timezone;
      const result = await db
        .update(schema.workoutSets)
        .set(updateData)
        .where(eq(schema.workoutSets.id, id))
        .returning()
        .get();
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update set' }, 500);
    }
  }),
);

router.delete(
  '/sets/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const set = await requireOwnedWorkoutSet({ userId, db }, id);
      if (set instanceof Response) return set;
      const result = await db.delete(schema.workoutSets).where(eq(schema.workoutSets.id, id)).run();
      return c.json({ success: result.success });
    } catch (_e) {
      return c.json({ message: 'Failed to delete set' }, 500);
    }
  }),
);

router.get(
  '/last/:exerciseId',
  createHandler(async (c, { userId, db }) => {
    const exerciseId = c.req.param('exerciseId') as string;
    try {
      const snapshot = await getLastCompletedExerciseSnapshot(db, userId, exerciseId);

      if (!snapshot) {
        return c.json(null);
      }

      return c.json({
        exerciseId: snapshot.exerciseId,
        workoutDate: snapshot.workoutDate,
        sets: snapshot.sets.map(
          (set: { weight: number | null; reps: number | null; rpe: number | null }) => ({
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
          }),
        ),
      });
    } catch (_e) {
      return c.json({ message: 'Failed to fetch last workout data' }, 500);
    }
  }),
);

export default router;

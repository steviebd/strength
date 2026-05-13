import { eq, and, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { requireOwnedRecord } from '../api/guards';
import { getLatestOneRMsForUser, getLastCompletedExerciseSnapshots } from '../lib/program-helpers';
import { getExerciseTypeByLibraryId } from '@strength/db/exercise-library';
import { getOrCreateExerciseForUser, generateWorkoutSchedule, batchParallel } from '@strength/db';
import { createProgramCycle } from '@strength/db';
import { resolveUserTimezone } from '../lib/timezone';
import { zonedDateTimeToUtc } from '@strength/db';

const router = createRouter();

function formatCustomProgramSessionName(
  programName: string,
  weekNumber: number,
  sessionNumber: number,
) {
  return `${programName} - Week ${weekNumber} - Workout ${sessionNumber}`;
}

// List custom programs
router.get(
  '/',
  createHandler(async (c, { userId, db }) => {
    const programs = await db
      .select()
      .from(schema.customPrograms)
      .where(
        and(eq(schema.customPrograms.userId, userId), eq(schema.customPrograms.isDeleted, false)),
      )
      .orderBy(schema.customPrograms.createdAt)
      .all();
    return c.json(programs);
  }),
);

// Create custom program
router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    const body = await c.req.json();
    const { id, name, description, notes, daysPerWeek, weeks } = body;
    if (!name || !daysPerWeek || !weeks) {
      return c.json({ message: 'name, daysPerWeek, and weeks are required' }, 400);
    }

    if (typeof id === 'string' && id.trim()) {
      const existing = await db
        .select({ id: schema.customPrograms.id, userId: schema.customPrograms.userId })
        .from(schema.customPrograms)
        .where(eq(schema.customPrograms.id, id))
        .get();

      if (existing && existing.userId !== userId) {
        return c.json({ message: 'Custom program id already exists' }, 409);
      }

      if (existing) {
        const updated = await db
          .update(schema.customPrograms)
          .set({
            name,
            description: description || null,
            notes: notes || null,
            daysPerWeek,
            weeks,
            isDeleted: false,
            updatedAt: new Date(),
          })
          .where(and(eq(schema.customPrograms.id, id), eq(schema.customPrograms.userId, userId)))
          .returning()
          .get();
        return c.json(updated, 200);
      }
    }

    const now = new Date();
    const result = await db
      .insert(schema.customPrograms)
      .values({
        ...(typeof id === 'string' && id.trim() ? { id } : {}),
        userId,
        name,
        description: description || null,
        notes: notes || null,
        daysPerWeek,
        weeks,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

// Get single custom program with workouts and exercises
router.get(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const program = await requireOwnedRecord({ userId, db }, schema.customPrograms, id, {
      extraConditions: [eq(schema.customPrograms.isDeleted, false)],
      notFoundBody: { message: 'Custom program not found' },
    });
    if (program instanceof Response) return program;

    const workouts = await db
      .select()
      .from(schema.customProgramWorkouts)
      .where(
        and(
          eq(schema.customProgramWorkouts.customProgramId, id),
          eq(schema.customProgramWorkouts.isDeleted, false),
        ),
      )
      .orderBy(schema.customProgramWorkouts.dayIndex)
      .all();

    const workoutIds = workouts.map((w) => w.id);
    let exercises: any[] = [];
    if (workoutIds.length > 0) {
      exercises = await db
        .select({
          id: schema.customProgramWorkoutExercises.id,
          customProgramWorkoutId: schema.customProgramWorkoutExercises.customProgramWorkoutId,
          exerciseId: schema.customProgramWorkoutExercises.exerciseId,
          orderIndex: schema.customProgramWorkoutExercises.orderIndex,
          exerciseType: schema.customProgramWorkoutExercises.exerciseType,
          sets: schema.customProgramWorkoutExercises.sets,
          reps: schema.customProgramWorkoutExercises.reps,
          repsRaw: schema.customProgramWorkoutExercises.repsRaw,
          weightMode: schema.customProgramWorkoutExercises.weightMode,
          fixedWeight: schema.customProgramWorkoutExercises.fixedWeight,
          percentageOfLift: schema.customProgramWorkoutExercises.percentageOfLift,
          percentageLift: schema.customProgramWorkoutExercises.percentageLift,
          addedWeight: schema.customProgramWorkoutExercises.addedWeight,
          targetDuration: schema.customProgramWorkoutExercises.targetDuration,
          targetDistance: schema.customProgramWorkoutExercises.targetDistance,
          targetHeight: schema.customProgramWorkoutExercises.targetHeight,
          isAmrap: schema.customProgramWorkoutExercises.isAmrap,
          isAccessory: schema.customProgramWorkoutExercises.isAccessory,
          isRequired: schema.customProgramWorkoutExercises.isRequired,
          setNumber: schema.customProgramWorkoutExercises.setNumber,
          progressionAmount: schema.customProgramWorkoutExercises.progressionAmount,
          progressionInterval: schema.customProgramWorkoutExercises.progressionInterval,
          progressionType: schema.customProgramWorkoutExercises.progressionType,
          name: schema.exercises.name,
          muscleGroup: schema.exercises.muscleGroup,
          libraryId: schema.exercises.libraryId,
        })
        .from(schema.customProgramWorkoutExercises)
        .innerJoin(
          schema.exercises,
          eq(schema.customProgramWorkoutExercises.exerciseId, schema.exercises.id),
        )
        .where(inArray(schema.customProgramWorkoutExercises.customProgramWorkoutId, workoutIds))
        .orderBy(schema.customProgramWorkoutExercises.orderIndex)
        .all();
    }

    const exercisesByWorkout = new Map<string, any[]>();
    for (const ex of exercises) {
      const list = exercisesByWorkout.get(ex.customProgramWorkoutId) ?? [];
      list.push(ex);
      exercisesByWorkout.set(ex.customProgramWorkoutId, list);
    }

    return c.json({
      ...program,
      workouts: (workouts as any[]).map((w) => ({
        ...w,
        exercises: exercisesByWorkout.get(w.id) ?? [],
      })),
    });
  }),
);

// Update custom program metadata
router.put(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const body = await c.req.json();

    const existing = await db
      .select({ id: schema.customPrograms.id })
      .from(schema.customPrograms)
      .where(
        and(
          eq(schema.customPrograms.id, id),
          eq(schema.customPrograms.userId, userId),
          eq(schema.customPrograms.isDeleted, false),
        ),
      )
      .get();

    if (!existing) {
      return c.json({ message: 'Custom program not found' }, 404);
    }

    const allowed: Record<string, any> = {};
    const keys = ['name', 'description', 'notes', 'daysPerWeek', 'weeks'] as const;
    for (const key of keys) {
      if (body[key] !== undefined) {
        allowed[key] = body[key];
      }
    }

    if (Object.keys(allowed).length === 0) {
      return c.json({ message: 'No fields to update' }, 400);
    }

    await db
      .update(schema.customPrograms)
      .set({ ...allowed, updatedAt: new Date() })
      .where(and(eq(schema.customPrograms.id, id), eq(schema.customPrograms.userId, userId)))
      .run();

    const updated = await db
      .select()
      .from(schema.customPrograms)
      .where(and(eq(schema.customPrograms.id, id), eq(schema.customPrograms.userId, userId)))
      .get();

    return c.json(updated);
  }),
);

// Soft delete custom program
router.delete(
  '/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    const result = await db
      .update(schema.customPrograms)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(and(eq(schema.customPrograms.id, id), eq(schema.customPrograms.userId, userId)))
      .run();
    return c.json({ success: result.success });
  }),
);

// Create/update workout (day slot) within a custom program
router.post(
  '/:id/workouts',
  createHandler(async (c, { userId, db }) => {
    const programId = c.req.param('id') as string;
    const program = await requireOwnedRecord({ userId, db }, schema.customPrograms, programId, {
      extraConditions: [eq(schema.customPrograms.isDeleted, false)],
      notFoundBody: { message: 'Custom program not found' },
    });
    if (program instanceof Response) return program;

    const body = await c.req.json();
    const { id: workoutId, dayIndex, name, orderIndex } = body;
    if (dayIndex === undefined || !name) {
      return c.json({ message: 'dayIndex and name are required' }, 400);
    }

    if (typeof workoutId === 'string' && workoutId.trim()) {
      const existing = await db
        .select({
          id: schema.customProgramWorkouts.id,
          customProgramId: schema.customProgramWorkouts.customProgramId,
        })
        .from(schema.customProgramWorkouts)
        .where(eq(schema.customProgramWorkouts.id, workoutId))
        .get();

      if (existing) {
        if (existing.customProgramId !== programId) {
          return c.json({ message: 'Workout id already exists for another custom program' }, 409);
        }

        const updated = await db
          .update(schema.customProgramWorkouts)
          .set({
            name,
            dayIndex,
            orderIndex: orderIndex ?? dayIndex,
            isDeleted: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.customProgramWorkouts.id, workoutId),
              eq(schema.customProgramWorkouts.customProgramId, programId),
            ),
          )
          .returning()
          .get();
        return c.json(updated, 200);
      }
    }

    const now = new Date();
    const result = await db
      .insert(schema.customProgramWorkouts)
      .values({
        ...(typeof workoutId === 'string' && workoutId.trim() ? { id: workoutId } : {}),
        customProgramId: programId,
        dayIndex,
        name,
        orderIndex: orderIndex ?? dayIndex,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

// Update workout metadata
router.put(
  '/workouts/:wid',
  createHandler(async (c, { userId, db }) => {
    const wid = c.req.param('wid') as string;
    const workout = await db
      .select({ id: schema.customProgramWorkouts.id })
      .from(schema.customProgramWorkouts)
      .innerJoin(
        schema.customPrograms,
        and(
          eq(schema.customProgramWorkouts.customProgramId, schema.customPrograms.id),
          eq(schema.customPrograms.userId, userId),
          eq(schema.customPrograms.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(schema.customProgramWorkouts.id, wid),
          eq(schema.customProgramWorkouts.isDeleted, false),
        ),
      )
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }

    const body = await c.req.json();
    const allowed: Record<string, any> = {};
    const keys = ['name', 'dayIndex', 'orderIndex'] as const;
    for (const key of keys) {
      if (body[key] !== undefined) allowed[key] = body[key];
    }
    if (Object.keys(allowed).length === 0) {
      return c.json({ message: 'No fields to update' }, 400);
    }

    const updated = await db
      .update(schema.customProgramWorkouts)
      .set({ ...allowed, updatedAt: new Date() })
      .where(eq(schema.customProgramWorkouts.id, wid))
      .returning()
      .get();
    return c.json(updated);
  }),
);

// Delete workout
router.delete(
  '/workouts/:wid',
  createHandler(async (c, { userId, db }) => {
    const wid = c.req.param('wid') as string;
    const workout = await db
      .select({ id: schema.customProgramWorkouts.id })
      .from(schema.customProgramWorkouts)
      .innerJoin(
        schema.customPrograms,
        and(
          eq(schema.customProgramWorkouts.customProgramId, schema.customPrograms.id),
          eq(schema.customPrograms.userId, userId),
          eq(schema.customPrograms.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(schema.customProgramWorkouts.id, wid),
          eq(schema.customProgramWorkouts.isDeleted, false),
        ),
      )
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }

    const result = await db
      .update(schema.customProgramWorkouts)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(eq(schema.customProgramWorkouts.id, wid))
      .run();
    return c.json({ success: result.success });
  }),
);

// Add exercise to a workout
router.post(
  '/workouts/:wid/exercises',
  createHandler(async (c, { userId, db }) => {
    const wid = c.req.param('wid') as string;
    const workout = await db
      .select({ id: schema.customProgramWorkouts.id })
      .from(schema.customProgramWorkouts)
      .innerJoin(
        schema.customPrograms,
        and(
          eq(schema.customProgramWorkouts.customProgramId, schema.customPrograms.id),
          eq(schema.customPrograms.userId, userId),
          eq(schema.customPrograms.isDeleted, false),
        ),
      )
      .where(
        and(
          eq(schema.customProgramWorkouts.id, wid),
          eq(schema.customProgramWorkouts.isDeleted, false),
        ),
      )
      .get();
    if (!workout) {
      return c.json({ message: 'Workout not found' }, 404);
    }

    const body = await c.req.json();
    const {
      id: requestedId,
      exerciseId,
      orderIndex,
      exerciseType,
      sets,
      reps,
      repsRaw,
      weightMode,
      fixedWeight,
      percentageOfLift,
      percentageLift,
      addedWeight,
      targetDuration,
      targetDistance,
      targetHeight,
      isAmrap,
      isAccessory,
      isRequired,
      setNumber,
      progressionAmount,
      progressionInterval,
      progressionType,
    } = body;

    if (!exerciseId || orderIndex === undefined) {
      return c.json({ message: 'exerciseId and orderIndex are required' }, 400);
    }

    const resolvedExerciseType =
      typeof exerciseType === 'string' &&
      ['weights', 'bodyweight', 'timed', 'cardio', 'plyo'].includes(exerciseType)
        ? exerciseType
        : 'weights';

    let resolvedExerciseId = exerciseId;
    const existingExercise = await db
      .select({ id: schema.exercises.id, libraryId: schema.exercises.libraryId })
      .from(schema.exercises)
      .where(
        and(
          eq(schema.exercises.userId, userId),
          eq(schema.exercises.isDeleted, false),
          eq(schema.exercises.id, exerciseId),
        ),
      )
      .get();

    if (!existingExercise) {
      const libraryExercise = schema.exerciseLibrary.find((e: any) => e.id === exerciseId);
      if (!libraryExercise) {
        return c.json({ message: 'Exercise not found' }, 404);
      }
      const now = new Date();
      const created = await db
        .insert(schema.exercises)
        .values({
          userId,
          name: libraryExercise.name,
          muscleGroup: libraryExercise.muscleGroup,
          description: libraryExercise.description,
          libraryId: libraryExercise.id,
          exerciseType: libraryExercise.exerciseType,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: schema.exercises.id })
        .get();
      if (!created) {
        const fallback = await db
          .select({ id: schema.exercises.id })
          .from(schema.exercises)
          .where(
            and(
              eq(schema.exercises.userId, userId),
              eq(schema.exercises.isDeleted, false),
              eq(schema.exercises.libraryId, libraryExercise.id),
            ),
          )
          .get();
        if (!fallback) {
          return c.json({ message: 'Failed to create exercise' }, 500);
        }
        resolvedExerciseId = fallback.id;
      } else {
        resolvedExerciseId = created.id;
      }
    }

    const insertValues: typeof schema.customProgramWorkoutExercises.$inferInsert = {
      ...(typeof requestedId === 'string' && requestedId.trim() ? { id: requestedId as any } : {}),
      customProgramWorkoutId: wid as any,
      exerciseId: resolvedExerciseId as any,
      orderIndex: orderIndex as any,
      exerciseType: resolvedExerciseType as any,
      sets: sets ?? null,
      reps: reps ?? null,
      repsRaw: repsRaw ?? null,
      weightMode: weightMode ?? null,
      fixedWeight: fixedWeight ?? null,
      percentageOfLift: percentageOfLift ?? null,
      percentageLift: percentageLift ?? null,
      addedWeight: addedWeight ?? 0,
      targetDuration: targetDuration ?? null,
      targetDistance: targetDistance ?? null,
      targetHeight: targetHeight ?? null,
      isAmrap: isAmrap ?? false,
      isAccessory: isAccessory ?? false,
      isRequired: isRequired !== false,
      setNumber: setNumber ?? null,
      progressionAmount: progressionAmount ?? null,
      progressionInterval: progressionInterval ?? 1,
      progressionType: progressionType ?? 'fixed',
    };

    if (typeof requestedId === 'string' && requestedId.trim()) {
      const existingExercise = await db
        .select({
          id: schema.customProgramWorkoutExercises.id,
          customProgramWorkoutId: schema.customProgramWorkoutExercises.customProgramWorkoutId,
        })
        .from(schema.customProgramWorkoutExercises)
        .where(eq(schema.customProgramWorkoutExercises.id, requestedId))
        .get();

      if (existingExercise) {
        if (existingExercise.customProgramWorkoutId !== wid) {
          return c.json({ message: 'Workout exercise id already exists' }, 409);
        }

        const updated = await db
          .update(schema.customProgramWorkoutExercises)
          .set(insertValues as any)
          .where(eq(schema.customProgramWorkoutExercises.id, requestedId))
          .returning()
          .get();
        return c.json(updated, 200);
      }
    }

    const result = await db
      .insert(schema.customProgramWorkoutExercises)
      .values(insertValues as any)
      .returning()
      .get();
    return c.json(result, 201);
  }),
);

// Update exercise within a workout
router.put(
  '/workouts/exercises/:eid',
  createHandler(async (c, { db }) => {
    const eid = c.req.param('eid') as string;
    const body = await c.req.json();

    const exerciseRow = await db
      .select({
        id: schema.customProgramWorkoutExercises.id,
        customProgramWorkoutId: schema.customProgramWorkoutExercises.customProgramWorkoutId,
      })
      .from(schema.customProgramWorkoutExercises)
      .where(eq(schema.customProgramWorkoutExercises.id, eid))
      .get();

    if (!exerciseRow) {
      return c.json({ message: 'Exercise not found' }, 404);
    }

    const allowed = [
      'orderIndex',
      'exerciseType',
      'sets',
      'reps',
      'repsRaw',
      'weightMode',
      'fixedWeight',
      'percentageOfLift',
      'percentageLift',
      'addedWeight',
      'targetDuration',
      'targetDistance',
      'targetHeight',
      'isAmrap',
      'isAccessory',
      'isRequired',
      'setNumber',
      'progressionAmount',
      'progressionInterval',
    ];

    const updates: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    await db
      .update(schema.customProgramWorkoutExercises)
      .set(updates)
      .where(eq(schema.customProgramWorkoutExercises.id, eid))
      .run();

    const updated = await db
      .select()
      .from(schema.customProgramWorkoutExercises)
      .where(eq(schema.customProgramWorkoutExercises.id, eid))
      .get();
    return c.json(updated);
  }),
);

// Delete exercise from a workout
router.delete(
  '/workouts/exercises/:eid',
  createHandler(async (c, { db }) => {
    const eid = c.req.param('eid') as string;
    const exerciseRow = await db
      .select({ id: schema.customProgramWorkoutExercises.id })
      .from(schema.customProgramWorkoutExercises)
      .where(eq(schema.customProgramWorkoutExercises.id, eid))
      .get();

    if (!exerciseRow) {
      return c.json({ message: 'Exercise not found' }, 404);
    }

    await db
      .delete(schema.customProgramWorkoutExercises)
      .where(eq(schema.customProgramWorkoutExercises.id, eid))
      .run();
    return c.json({ success: true });
  }),
);

// Start a custom program — creates a program cycle
router.post(
  '/:id/start',
  createHandler(async (c, { userId, db }) => {
    const programId = c.req.param('id') as string;
    const program = await db
      .select()
      .from(schema.customPrograms)
      .where(
        and(
          eq(schema.customPrograms.id, programId),
          eq(schema.customPrograms.userId, userId),
          eq(schema.customPrograms.isDeleted, false),
        ),
      )
      .get();
    if (!program) {
      return c.json({ message: 'Custom program not found' }, 404);
    }

    const body = await c.req.json();
    const {
      id: cycleId,
      name,
      squat1rm: bodySquat,
      bench1rm: bodyBench,
      deadlift1rm: bodyDeadlift,
      ohp1rm: bodyOhp,
      exercise1rms = {},
      preferredGymDays,
      preferredTimeOfDay,
      programStartDate,
      firstSessionDate,
    } = body;

    // Get workouts (day slots) with exercises
    const workouts = await db
      .select()
      .from(schema.customProgramWorkouts)
      .where(
        and(
          eq(schema.customProgramWorkouts.customProgramId, programId),
          eq(schema.customProgramWorkouts.isDeleted, false),
        ),
      )
      .orderBy(schema.customProgramWorkouts.dayIndex)
      .all();

    if (workouts.length === 0) {
      return c.json({ message: 'Custom program has no workouts defined' }, 400);
    }

    const workoutIds = workouts.map((w) => w.id);
    const exercises = await db
      .select({
        id: schema.customProgramWorkoutExercises.id,
        customProgramWorkoutId: schema.customProgramWorkoutExercises.customProgramWorkoutId,
        exerciseId: schema.customProgramWorkoutExercises.exerciseId,
        orderIndex: schema.customProgramWorkoutExercises.orderIndex,
        exerciseType: schema.customProgramWorkoutExercises.exerciseType,
        sets: schema.customProgramWorkoutExercises.sets,
        reps: schema.customProgramWorkoutExercises.reps,
        repsRaw: schema.customProgramWorkoutExercises.repsRaw,
        weightMode: schema.customProgramWorkoutExercises.weightMode,
        fixedWeight: schema.customProgramWorkoutExercises.fixedWeight,
        percentageOfLift: schema.customProgramWorkoutExercises.percentageOfLift,
        percentageLift: schema.customProgramWorkoutExercises.percentageLift,
        addedWeight: schema.customProgramWorkoutExercises.addedWeight,
        targetDuration: schema.customProgramWorkoutExercises.targetDuration,
        targetDistance: schema.customProgramWorkoutExercises.targetDistance,
        targetHeight: schema.customProgramWorkoutExercises.targetHeight,
        isAmrap: schema.customProgramWorkoutExercises.isAmrap,
        isAccessory: schema.customProgramWorkoutExercises.isAccessory,
        isRequired: schema.customProgramWorkoutExercises.isRequired,
        setNumber: schema.customProgramWorkoutExercises.setNumber,
        progressionAmount: schema.customProgramWorkoutExercises.progressionAmount,
        progressionInterval: schema.customProgramWorkoutExercises.progressionInterval,
        progressionType: schema.customProgramWorkoutExercises.progressionType,
        name: schema.exercises.name,
        libraryId: schema.exercises.libraryId,
      })
      .from(schema.customProgramWorkoutExercises)
      .innerJoin(
        schema.exercises,
        eq(schema.customProgramWorkoutExercises.exerciseId, schema.exercises.id),
      )
      .where(inArray(schema.customProgramWorkoutExercises.customProgramWorkoutId, workoutIds))
      .orderBy(schema.customProgramWorkoutExercises.orderIndex)
      .all();

    const exercisesByWorkout = new Map<string, typeof exercises>();
    for (const ex of exercises) {
      const list = exercisesByWorkout.get(ex.customProgramWorkoutId) ?? [];
      list.push(ex);
      exercisesByWorkout.set(ex.customProgramWorkoutId, list);
    }

    // Resolve 1RMs
    const latestOneRMs = await getLatestOneRMsForUser(db, userId);
    function pickOneRM(input: unknown, fallback: number | null | undefined): number {
      return typeof input === 'number' && Number.isFinite(input) && input > 0
        ? input
        : (fallback ?? 0);
    }

    const oneRMs = {
      squat: pickOneRM(bodySquat, latestOneRMs?.squat1rm),
      bench: pickOneRM(bodyBench, latestOneRMs?.bench1rm),
      deadlift: pickOneRM(bodyDeadlift, latestOneRMs?.deadlift1rm),
      ohp: pickOneRM(bodyOhp, latestOneRMs?.ohp1rm),
    };

    // Batch lookup for history-based exercises
    const historyExerciseIds = [
      ...new Set(
        exercises.filter((ex) => ex.weightMode === 'from_history').map((ex) => ex.exerciseId),
      ),
    ];
    const historySnapshots =
      historyExerciseIds.length > 0
        ? await getLastCompletedExerciseSnapshots(db, userId, historyExerciseIds)
        : [];
    const historyWeightMap = new Map<string, number>();
    for (const snap of historySnapshots) {
      const weight = snap.sets?.[0]?.weight;
      if (weight != null) {
        historyWeightMap.set(snap.exerciseId, weight);
      }
    }

    // Build all workout definitions for Y weeks
    const totalSessions = program.daysPerWeek * program.weeks;
    const allWorkoutDefs: Array<{
      weekNumber: number;
      sessionNumber: number;
      sessionName: string;
      exercises: any[];
    }> = [];

    for (let week = 1; week <= program.weeks; week++) {
      for (let day = 0; day < program.daysPerWeek; day++) {
        const workoutDef = workouts[day];
        if (!workoutDef) continue;
        const sessionNumber = day + 1;

        const dayExercises = exercisesByWorkout.get(workoutDef.id) ?? [];
        const resolvedExercises = dayExercises.map((ex) => {
          let targetWeight: number | null = null;

          if (ex.weightMode === 'prompt_1rm' && ex.percentageOfLift != null) {
            const customRm = exercise1rms[ex.exerciseId];
            if (typeof customRm === 'number' && Number.isFinite(customRm) && customRm > 0) {
              targetWeight = (ex.percentageOfLift / 100) * customRm;
            }
          } else if (
            ex.weightMode === 'percentage' &&
            ex.percentageOfLift != null &&
            ex.percentageLift
          ) {
            const liftKey = ex.percentageLift as 'squat' | 'bench' | 'deadlift' | 'ohp';
            targetWeight = (ex.percentageOfLift / 100) * oneRMs[liftKey];
          } else if (ex.weightMode === 'from_history') {
            targetWeight = historyWeightMap.get(ex.exerciseId) ?? ex.fixedWeight ?? null;
          } else if (ex.fixedWeight != null) {
            targetWeight = ex.fixedWeight;
          }

          // Apply progression
          const progAmount = ex.progressionAmount ?? 0;
          const progInterval = ex.progressionInterval ?? 1;
          const progType = ex.progressionType ?? 'fixed';
          if (progAmount > 0 && progInterval > 0) {
            const progressSteps = Math.floor((week - 1) / progInterval);
            if (ex.exerciseType === 'weights' && targetWeight != null) {
              if (progType === 'percentage') {
                targetWeight *= Math.pow(1 + progAmount / 100, progressSteps);
              } else {
                targetWeight += progAmount * progressSteps;
              }
            }
          }

          return {
            name: ex.name ?? '',
            lift: ex.percentageLift ?? null,
            targetWeight,
            sets: ex.sets ?? 3,
            reps: ex.reps ?? 10,
            exerciseType: ex.exerciseType ?? 'weights',
            targetDuration: ex.targetDuration ?? null,
            targetDistance: ex.targetDistance ?? null,
            targetHeight: ex.targetHeight ?? null,
            isAmrap: ex.isAmrap ?? false,
            libraryId: ex.libraryId ?? null,
            exerciseId: ex.exerciseId ?? null,
          };
        });

        allWorkoutDefs.push({
          weekNumber: week,
          sessionNumber,
          sessionName: formatCustomProgramSessionName(name || program.name, week, sessionNumber),
          exercises: resolvedExercises,
        });
      }
    }

    // Schedule
    const timezoneResult = await resolveUserTimezone(db, userId, body.timezone);
    const timezone = timezoneResult.timezone ?? 'UTC';

    const startDate = programStartDate
      ? zonedDateTimeToUtc(programStartDate, timezone, '00:00:00')
      : new Date();
    const firstDate = firstSessionDate
      ? zonedDateTimeToUtc(firstSessionDate, timezone, '00:00:00')
      : undefined;
    const programStartAt = startDate.getTime();

    const scheduleOptions = {
      preferredDays: (Array.isArray(preferredGymDays) && preferredGymDays.length > 0
        ? preferredGymDays
        : ['monday', 'wednesday', 'friday']) as any,
      preferredTimeOfDay: preferredTimeOfDay || 'morning',
    };

    const schedule = generateWorkoutSchedule(
      allWorkoutDefs.map((w) => ({
        weekNumber: w.weekNumber,
        sessionNumber: w.sessionNumber,
        sessionName: w.sessionName,
      })),
      startDate,
      { ...scheduleOptions, forceFirstSessionDate: firstDate },
    );

    // Resolve exercise IDs
    const exerciseResolutionTasks: Array<{
      defIndex: number;
      exIndex: number;
      name: string;
      libraryId?: string | null;
    }> = [];

    for (let di = 0; di < allWorkoutDefs.length; di++) {
      const def = allWorkoutDefs[di];
      for (let ei = 0; ei < def.exercises.length; ei++) {
        const ex = def.exercises[ei];
        if (ex.libraryId || ex.name) {
          exerciseResolutionTasks.push({
            defIndex: di,
            exIndex: ei,
            name: ex.name,
            libraryId: ex.libraryId,
          });
        }
      }
    }

    const resolvedExIds = await batchParallel(
      exerciseResolutionTasks.map(
        (t) => () =>
          getOrCreateExerciseForUser(db, userId, t.name, undefined, t.libraryId ?? undefined),
      ),
    );

    const exerciseIdMap = new Map<string, string>();
    for (let i = 0; i < exerciseResolutionTasks.length; i++) {
      const key = `${exerciseResolutionTasks[i].defIndex}_${exerciseResolutionTasks[i].exIndex}`;
      exerciseIdMap.set(key, resolvedExIds[i]);
    }

    // Build final workout data for cycle creation
    const cycleWorkouts = allWorkoutDefs.map((def, defIndex) => {
      const scheduleEntry = schedule[defIndex];
      const mappedExercises = def.exercises.map((ex, exIndex) => {
        const key = `${defIndex}_${exIndex}`;
        const exerciseType = ex.libraryId
          ? getExerciseTypeByLibraryId(ex.libraryId)
          : (ex.exerciseType ?? 'weights');
        return {
          name: ex.name,
          lift: ex.lift,
          targetWeight: ex.targetWeight,
          sets: ex.sets,
          reps: ex.reps,
          exerciseType,
          targetDuration: ex.targetDuration ?? null,
          targetDistance: ex.targetDistance ?? null,
          targetHeight: ex.targetHeight ?? null,
          isAmrap: ex.isAmrap ?? false,
          isAccessory: false,
          libraryId: ex.libraryId,
          exerciseId: exerciseIdMap.get(key),
        };
      });

      return {
        id: undefined,
        weekNumber: def.weekNumber,
        sessionNumber: def.sessionNumber,
        sessionName: def.sessionName,
        scheduledAt:
          scheduleEntry?.scheduledDate instanceof Date &&
          !isNaN(scheduleEntry.scheduledDate.getTime())
            ? scheduleEntry.scheduledDate.getTime()
            : undefined,
        targetLifts: JSON.stringify({
          exercises: mappedExercises,
          accessories: [],
        }),
      };
    });

    const cycle = await createProgramCycle(db, userId, {
      programSlug: `custom:${program.id}`,
      name: name || program.name,
      squat1rm: oneRMs.squat,
      bench1rm: oneRMs.bench,
      deadlift1rm: oneRMs.deadlift,
      ohp1rm: oneRMs.ohp,
      totalSessionsPlanned: totalSessions,
      estimatedWeeks: program.weeks,
      preferredGymDays: scheduleOptions.preferredDays,
      preferredTimeOfDay: scheduleOptions.preferredTimeOfDay,
      programStartAt,
      firstSessionAt: firstDate?.getTime(),
      workouts: cycleWorkouts,
      id: cycleId,
    });

    return c.json(cycle, 201);
  }),
);

export default router;

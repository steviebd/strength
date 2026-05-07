import { eq, and, sql, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { formatLocalDate } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { requireOwnedRecord, requireOwnedProgramCycleWorkout } from '../api/guards';
import {
  parseProgramTargetLifts,
  getCurrentCycleWorkout,
  getLatestOneRMTestWorkoutForCycle,
  createOneRMTestWorkout,
  updateProgramCycleOneRMs,
  normalizeProgramReps,
  consolidateProgramTargetLifts,
  completeProgramCycle,
  startCycleWorkout,
} from '../lib/program-helpers';
import { getProgramCycleWithWorkouts, getProgramCycleById } from '@strength/db';
import { getUtcRangeForLocalDate } from '../lib/timezone';
import { pickAllowedKeys } from '../lib/validation';

const router = createRouter();

router.get(
  '/cycles/:id/schedule',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const ownedCycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (ownedCycle instanceof Response) return ownedCycle;

    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    const { cycle, workouts } = result;
    const profileTimezone = await db
      .select({ timezone: schema.userPreferences.timezone })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();
    const timezone = profileTimezone?.timezone ?? 'UTC';
    const { start: todayStart, end: todayEnd } = getUtcRangeForLocalDate(
      formatLocalDate(new Date(), timezone),
      timezone,
    );

    const workoutIds = workouts.filter((w) => w.workoutId).map((w) => w.workoutId as string);

    const linkedWorkouts =
      workoutIds.length > 0
        ? await db
            .select({ id: schema.workouts.id, completedAt: schema.workouts.completedAt })
            .from(schema.workouts)
            .where(and(inArray(schema.workouts.id, workoutIds), eq(schema.workouts.userId, userId)))
            .all()
        : [];

    const linkedWorkoutMap = new Map(linkedWorkouts.map((w) => [w.id, w]));

    const thisWeek: any[] = [];
    const upcoming: any[] = [];
    const completed: any[] = [];

    for (const workout of workouts) {
      const linkedWorkout = workout.workoutId ? linkedWorkoutMap.get(workout.workoutId) : undefined;
      const isWorkoutComplete = workout.isComplete || !!linkedWorkout?.completedAt;
      const parsedTargetLifts = parseProgramTargetLifts(workout.targetLifts);
      const exercises = parsedTargetLifts.all.map((l) => l.name);

      if (!workout.scheduledAt) {
        const scheduleWorkout = {
          cycleWorkoutId: workout.id,
          workoutId: workout.workoutId ?? null,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          name: workout.sessionName,
          exercises,
          scheduledAt: null,
          status: isWorkoutComplete ? 'complete' : 'unscheduled',
        };
        if (isWorkoutComplete) {
          completed.push(scheduleWorkout);
        } else {
          upcoming.push(scheduleWorkout);
        }
        continue;
      }

      const scheduledTime = workout.scheduledAt;
      if (isWorkoutComplete) {
        completed.push({
          cycleWorkoutId: workout.id,
          workoutId: workout.workoutId ?? null,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          name: workout.sessionName,
          exercises,
          scheduledAt: scheduledTime,
          status: 'complete' as const,
        });
      } else if (scheduledTime >= todayStart.getTime() && scheduledTime < todayEnd.getTime()) {
        thisWeek.push({
          cycleWorkoutId: workout.id,
          workoutId: workout.workoutId ?? null,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          name: workout.sessionName,
          exercises,
          scheduledAt: scheduledTime,
          status: 'today' as const,
        });
      } else if (scheduledTime >= todayEnd.getTime()) {
        upcoming.push({
          cycleWorkoutId: workout.id,
          workoutId: workout.workoutId ?? null,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          name: workout.sessionName,
          exercises,
          scheduledAt: scheduledTime,
          status: 'upcoming' as const,
        });
      } else {
        thisWeek.push({
          cycleWorkoutId: workout.id,
          workoutId: workout.workoutId ?? null,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          name: workout.sessionName,
          exercises,
          scheduledAt: scheduledTime,
          status: 'missed' as const,
        });
      }
    }

    return c.json({
      cycle: {
        id: cycle.id,
        name: cycle.name,
        timezone,
        currentWeek: cycle.currentWeek ?? null,
        currentSession: cycle.currentSession ?? null,
        totalSessionsCompleted: cycle.totalSessionsCompleted,
        totalSessionsPlanned: cycle.totalSessionsPlanned,
      },
      thisWeek,
      upcoming,
      completed,
    });
  }),
);

router.put(
  '/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const ownedCycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (ownedCycle instanceof Response) return ownedCycle;

    const body = await c.req.json();
    const { squat1rm, bench1rm, deadlift1rm, ohp1rm, currentWeek, currentSession, isComplete } =
      body;

    let updated = null;
    const hasOneRMUpdate =
      squat1rm !== undefined ||
      bench1rm !== undefined ||
      deadlift1rm !== undefined ||
      ohp1rm !== undefined;

    if (currentWeek !== undefined || currentSession !== undefined || isComplete === true) {
      const cycle = await getProgramCycleById(db, cycleId, userId);
      if (!cycle) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }
    }

    if (hasOneRMUpdate) {
      updated = await updateProgramCycleOneRMs(db, userId, cycleId, {
        squat1rm,
        bench1rm,
        deadlift1rm,
        ohp1rm,
      });
    }

    if (currentWeek !== undefined || currentSession !== undefined) {
      updated = await db
        .update(schema.userProgramCycles)
        .set({
          ...(currentWeek !== undefined && { currentWeek }),
          ...(currentSession !== undefined && { currentSession }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userProgramCycles.id, cycleId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .returning()
        .get();
    }

    if (isComplete === true) {
      updated = await completeProgramCycle(db, cycleId, userId);
    }

    if (!updated) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    return c.json(updated);
  }),
);

router.get(
  '/cycles/:id/workouts',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }
    return c.json(result.workouts);
  }),
);

router.get(
  '/cycles/:id/workouts/current',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }
    const currentWorkout = getCurrentCycleWorkout(result.cycle, result.workouts);
    if (!currentWorkout) {
      return c.json({ message: 'Current workout not found' }, 404);
    }
    const parsedTargetLifts = parseProgramTargetLifts(currentWorkout.targetLifts);
    const exercises = consolidateProgramTargetLifts(parsedTargetLifts.all);

    return c.json({
      id: currentWorkout.id,
      cycleId: currentWorkout.cycleId,
      templateId: currentWorkout.templateId,
      weekNumber: currentWorkout.weekNumber,
      sessionNumber: currentWorkout.sessionNumber,
      sessionName: currentWorkout.sessionName,
      targetLifts: currentWorkout.targetLifts,
      isComplete: currentWorkout.isComplete,
      workoutId: currentWorkout.workoutId,
      scheduledAt: currentWorkout.scheduledAt,
      exercises: exercises.map((exercise, index) => ({
        id: `${currentWorkout.id}:${index}`,
        orderIndex: index,
        targetWeight: exercise.targetWeight,
        addedWeight: exercise.addedWeight,
        sets: exercise.sets,
        reps:
          typeof exercise.reps === 'number' ? exercise.reps : normalizeProgramReps(exercise.reps),
        repsRaw: typeof exercise.reps === 'string' ? exercise.reps : null,
        exerciseType: exercise.exerciseType,
        targetDuration: exercise.targetDuration,
        targetDistance: exercise.targetDistance,
        targetHeight: exercise.targetHeight,
        isAmrap: exercise.isAmrap,
        isAccessory: exercise.isAccessory,
        isRequired: exercise.isRequired,
        exercise: {
          id: exercise.exerciseId ?? exercise.libraryId ?? exercise.accessoryId ?? exercise.name,
          name: exercise.name,
          muscleGroup: null,
        },
      })),
    });
  }),
);

router.post(
  '/cycles/:id/create-1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const workout = await createOneRMTestWorkout(db, userId, cycleId);
    if (!workout) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    return c.json({ workoutId: workout.id, workoutName: workout.name }, 201);
  }),
);

router.get(
  '/cycles/:id/1rm-test-draft',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    return c.json({
      workoutName: '1RM Test',
      workoutType: schema.WORKOUT_TYPE_ONE_RM_TEST,
      programCycleId: cycleId,
      exercises: [
        { name: 'Squat', lift: 'squat', libraryId: 'barbell-squat', weight: 0, reps: 1 },
        {
          name: 'Bench Press',
          lift: 'bench',
          libraryId: 'barbell-bench-press',
          weight: 0,
          reps: 1,
        },
        { name: 'Deadlift', lift: 'deadlift', libraryId: 'deadlift', weight: 0, reps: 1 },
        {
          name: 'Overhead Press',
          lift: 'ohp',
          libraryId: 'overhead-press',
          weight: 0,
          reps: 1,
        },
      ],
    });
  }),
);

router.get(
  '/cycles/:id/1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const workout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
    if (!workout) {
      return c.json({ message: '1RM test workout not found' }, 404);
    }

    return c.json(workout);
  }),
);

router.put(
  '/cycles/:id/1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const body = await c.req.json();
    const shouldCompleteCycle = body.isComplete === true;
    const workout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
    if (!workout) {
      return c.json({ message: '1RM test workout not found' }, 404);
    }

    const updateFields = pickAllowedKeys(body, [
      'squat1rm',
      'bench1rm',
      'deadlift1rm',
      'ohp1rm',
      'startingSquat1rm',
      'startingBench1rm',
      'startingDeadlift1rm',
      'startingOhp1rm',
    ]);
    const filteredFields: Record<string, number> = {};
    for (const [key, value] of Object.entries(updateFields)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        filteredFields[key] = value;
      }
    }
    const updatedWorkout = await db
      .update(schema.workouts)
      .set({
        ...filteredFields,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.workouts.id, workout.id), eq(schema.workouts.userId, userId)))
      .returning()
      .get();

    await updateProgramCycleOneRMs(db, userId, cycleId, {
      squat1rm: body.squat1rm,
      bench1rm: body.bench1rm,
      deadlift1rm: body.deadlift1rm,
      ohp1rm: body.ohp1rm,
    });

    if (shouldCompleteCycle) {
      await completeProgramCycle(db, cycleId, userId);
    }

    return c.json(updatedWorkout);
  }),
);

router.get(
  '/cycle-workouts/:cycleWorkoutId',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    const cycleWorkout = await requireOwnedProgramCycleWorkout({ userId, db }, cycleWorkoutId);
    if (cycleWorkout instanceof Response) return cycleWorkout;

    const parsedTargetLifts = parseProgramTargetLifts(cycleWorkout.targetLifts);
    const exercises = consolidateProgramTargetLifts(parsedTargetLifts.all);

    return c.json({
      id: cycleWorkout.id,
      cycleId: cycleWorkout.cycleId,
      templateId: cycleWorkout.templateId,
      weekNumber: cycleWorkout.weekNumber,
      sessionNumber: cycleWorkout.sessionNumber,
      sessionName: cycleWorkout.sessionName,
      targetLifts: cycleWorkout.targetLifts,
      isComplete: cycleWorkout.isComplete,
      workoutId: cycleWorkout.workoutId,
      scheduledAt: cycleWorkout.scheduledAt,
      exercises: exercises.map((exercise, index) => ({
        id: `${cycleWorkout.id}:${index}`,
        orderIndex: index,
        targetWeight: exercise.targetWeight,
        addedWeight: exercise.addedWeight,
        sets: exercise.sets,
        reps:
          typeof exercise.reps === 'number' ? exercise.reps : normalizeProgramReps(exercise.reps),
        repsRaw: typeof exercise.reps === 'string' ? exercise.reps : null,
        exerciseType: exercise.exerciseType,
        targetDuration: exercise.targetDuration,
        targetDistance: exercise.targetDistance,
        targetHeight: exercise.targetHeight,
        isAmrap: exercise.isAmrap,
        isAccessory: exercise.isAccessory,
        isRequired: exercise.isRequired,
        exercise: {
          id: exercise.exerciseId ?? exercise.libraryId ?? exercise.accessoryId ?? exercise.name,
          name: exercise.name,
          muscleGroup: null,
        },
      })),
    });
  }),
);

router.post(
  '/cycles/:id/workouts/current/start',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    const currentCycleWorkout = getCurrentCycleWorkout(result.cycle, result.workouts);

    if (!currentCycleWorkout) {
      return c.json({ message: 'Current workout not found' }, 404);
    }

    const workoutResult = await startCycleWorkout(db, userId, currentCycleWorkout);

    return c.json({
      workoutId: workoutResult.workoutId,
      cycleWorkoutId: currentCycleWorkout.id,
      sessionName: workoutResult.sessionName,
      created: workoutResult.created,
      completed: workoutResult.completed,
    });
  }),
);

router.post(
  '/cycle-workouts/:cycleWorkoutId/start',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    const cycleWorkout = await requireOwnedProgramCycleWorkout({ userId, db }, cycleWorkoutId);
    if (cycleWorkout instanceof Response) return cycleWorkout;

    const result = await startCycleWorkout(db, userId, cycleWorkout);

    return c.json({
      workoutId: result.workoutId,
      sessionName: result.sessionName,
      created: result.created,
      completed: result.completed,
      programCycleId: cycleWorkout.cycleId,
    });
  }),
);

router.post(
  '/cycles/:id/complete-session',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    const cycleData = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycleData instanceof Response) return cycleData;

    if (cycleData.isComplete) {
      return c.json({ message: 'Cycle already completed' }, 409);
    }

    const totalSessionsCompleted = cycleData.totalSessionsCompleted ?? 0;
    const newSessionsCompleted = totalSessionsCompleted + 1;

    if (newSessionsCompleted > cycleData.totalSessionsPlanned) {
      return c.json({ message: 'Invalid session count' }, 400);
    }

    const cycleWorkouts = await db
      .select({
        id: schema.programCycleWorkouts.id,
        weekNumber: schema.programCycleWorkouts.weekNumber,
        sessionNumber: schema.programCycleWorkouts.sessionNumber,
      })
      .from(schema.programCycleWorkouts)
      .where(eq(schema.programCycleWorkouts.cycleId, cycleId))
      .orderBy(schema.programCycleWorkouts.weekNumber, schema.programCycleWorkouts.sessionNumber)
      .all();

    const nextCycleWorkout = cycleWorkouts[newSessionsCompleted] ?? null;

    let result;
    if (nextCycleWorkout) {
      result = await db
        .update(schema.userProgramCycles)
        .set({
          currentWeek: nextCycleWorkout.weekNumber,
          currentSession: nextCycleWorkout.sessionNumber,
          totalSessionsCompleted: sql`${schema.userProgramCycles.totalSessionsCompleted} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userProgramCycles.id, cycleId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .returning()
        .get();
    } else {
      const completed = await completeProgramCycle(db, cycleId, userId);
      if (!completed) {
        return c.json({ message: 'Cycle already completed' }, 409);
      }
      result = await db
        .update(schema.userProgramCycles)
        .set({
          totalSessionsCompleted: sql`${schema.userProgramCycles.totalSessionsCompleted} + 1`,
        })
        .where(
          and(
            eq(schema.userProgramCycles.id, cycleId),
            eq(schema.userProgramCycles.userId, userId),
          ),
        )
        .returning()
        .get();
    }

    if (!result) {
      return c.json({ message: 'Failed to update program cycle' }, 500);
    }
    return c.json(result);
  }),
);

router.put(
  '/cycle-workouts/:cycleWorkoutId/schedule',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    const body = await c.req.json();
    const { scheduledAt } = body as { scheduledAt?: number };

    if (scheduledAt === undefined) {
      return c.json({ message: 'scheduledAt is required' }, 400);
    }

    if (typeof scheduledAt !== 'number' || !Number.isFinite(scheduledAt)) {
      return c.json({ message: 'scheduledAt must be a valid timestamp' }, 400);
    }

    const cycleWorkout = await requireOwnedProgramCycleWorkout({ userId, db }, cycleWorkoutId);
    if (cycleWorkout instanceof Response) return cycleWorkout;

    const profileTimezone = await db
      .select({ timezone: schema.userPreferences.timezone })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .get();
    const timezone = profileTimezone?.timezone ?? 'UTC';
    const { start: dayStart, end: dayEnd } = getUtcRangeForLocalDate(
      formatLocalDate(new Date(), timezone),
      timezone,
    );
    let warning: 'date_collision' | undefined;
    const existingScheduledAt = cycleWorkout.scheduledAt;
    if (
      existingScheduledAt === null ||
      existingScheduledAt === undefined ||
      scheduledAt < dayStart.getTime() ||
      scheduledAt >= dayEnd.getTime()
    ) {
      // no-op
    } else {
      const collision = await db
        .select({ id: schema.programCycleWorkouts.id })
        .from(schema.programCycleWorkouts)
        .innerJoin(
          schema.userProgramCycles,
          eq(schema.programCycleWorkouts.cycleId, schema.userProgramCycles.id),
        )
        .where(
          and(
            eq(schema.userProgramCycles.userId, userId),
            sql`${schema.programCycleWorkouts.scheduledAt} >= ${dayStart.getTime()}`,
            sql`${schema.programCycleWorkouts.scheduledAt} < ${dayEnd.getTime()}`,
            sql`${schema.programCycleWorkouts.id} != ${cycleWorkoutId}`,
          ),
        )
        .get();

      if (collision) {
        warning = 'date_collision';
      }
    }

    const updated = await db
      .update(schema.programCycleWorkouts)
      .set({ scheduledAt: new Date(scheduledAt), updatedAt: new Date() })
      .where(
        and(
          eq(schema.programCycleWorkouts.id, cycleWorkoutId),
          inArray(
            schema.programCycleWorkouts.cycleId,
            db
              .select({ id: schema.userProgramCycles.id })
              .from(schema.userProgramCycles)
              .where(eq(schema.userProgramCycles.userId, userId)),
          ),
        ),
      )
      .returning()
      .get();

    const workout = {
      id: updated.id,
      cycleId: updated.cycleId,
      weekNumber: updated.weekNumber,
      sessionNumber: updated.sessionNumber,
      sessionName: updated.sessionName,
      targetLifts: updated.targetLifts,
      isComplete: updated.isComplete,
      workoutId: updated.workoutId,
      scheduledAt: updated.scheduledAt,
    };

    return c.json({ workout, ...(warning ? { warning } : {}) });
  }),
);

export default router;

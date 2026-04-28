import { eq, and, sql, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { formatLocalDate } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { requireOwnedProgramCycle, requireOwnedProgramCycleWorkout } from '../api/guards';
import {
  parseProgramTargetLifts,
  getCurrentCycleWorkout,
  getLatestOneRMTestWorkoutForCycle,
  createOneRMTestWorkout,
  updateProgramCycleOneRMs,
  createWorkoutFromProgramCycleWorkout,
  normalizeProgramReps,
  consolidateProgramTargetLifts,
} from '../lib/program-helpers';
import { getProgramCycleWithWorkouts, getProgramCycleById } from '@strength/db';
import { getUtcRangeForLocalDate } from '../lib/timezone';

export function buildOneRMTestWorkoutUpdate(body: Record<string, unknown>) {
  const pickNumber = (key: string): number | undefined => {
    const value = body[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  };
  return {
    squat1rm: pickNumber('squat1rm'),
    bench1rm: pickNumber('bench1rm'),
    deadlift1rm: pickNumber('deadlift1rm'),
    ohp1rm: pickNumber('ohp1rm'),
    startingSquat1rm: pickNumber('startingSquat1rm'),
    startingBench1rm: pickNumber('startingBench1rm'),
    startingDeadlift1rm: pickNumber('startingDeadlift1rm'),
    startingOhp1rm: pickNumber('startingOhp1rm'),
  };
}

const router = createRouter();

router.get(
  '/cycles/:id/schedule',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const ownedCycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
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
              .where(
                and(inArray(schema.workouts.id, workoutIds), eq(schema.workouts.userId, userId)),
              )
              .all()
          : [];

      const linkedWorkoutMap = new Map(linkedWorkouts.map((w) => [w.id, w]));

      const thisWeek: any[] = [];
      const upcoming: any[] = [];
      const completed: any[] = [];

      for (const workout of workouts) {
        const linkedWorkout = workout.workoutId
          ? linkedWorkoutMap.get(workout.workoutId)
          : undefined;
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
    } catch {
      return c.json({ message: 'Failed to fetch program cycle schedule' }, 500);
    }
  }),
);

router.put(
  '/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const ownedCycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
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

      if (hasOneRMUpdate) {
        updated = await updateProgramCycleOneRMs(db, userId, cycleId, {
          squat1rm,
          bench1rm,
          deadlift1rm,
          ohp1rm,
        });
      }

      if (currentWeek !== undefined || currentSession !== undefined || isComplete === true) {
        const cycle = await getProgramCycleById(db, cycleId, userId);
        if (!cycle) {
          return c.json({ message: 'Program cycle not found' }, 404);
        }

        updated = await db
          .update(schema.userProgramCycles)
          .set({
            ...(currentWeek !== undefined && { currentWeek }),
            ...(currentSession !== undefined && { currentSession }),
            ...(isComplete === true && {
              isComplete: true,
              status: 'completed',
              completedAt: new Date(),
            }),
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

      if (!updated) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      return c.json(updated);
    } catch {
      return c.json({ message: 'Failed to update program cycle' }, 500);
    }
  }),
);

router.get(
  '/cycles/:id/workouts',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }
      return c.json(result.workouts);
    } catch {
      return c.json({ message: 'Failed to fetch workouts' }, 500);
    }
  }),
);

router.get(
  '/cycles/:id/workouts/current',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
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
        weekNumber: currentWorkout.weekNumber,
        sessionNumber: currentWorkout.sessionNumber,
        sessionName: currentWorkout.sessionName,
        isComplete: currentWorkout.isComplete,
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
          isAmrap: exercise.isAmrap,
          isAccessory: exercise.isAccessory,
          isRequired: exercise.isRequired,
          exercise: {
            id: exercise.accessoryId ?? exercise.lift ?? exercise.name,
            name: exercise.name,
            muscleGroup: null,
          },
        })),
      });
    } catch {
      return c.json({ message: 'Failed to fetch current workout' }, 500);
    }
  }),
);

router.post(
  '/cycles/:id/create-1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const workout = await createOneRMTestWorkout(db, userId, cycleId);
      if (!workout) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      return c.json({ workoutId: workout.id, workoutName: workout.name }, 201);
    } catch {
      return c.json({ message: 'Failed to create 1RM test workout' }, 500);
    }
  }),
);

router.get(
  '/cycles/:id/1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const workout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
      if (!workout) {
        return c.json({ message: '1RM test workout not found' }, 404);
      }

      return c.json(workout);
    } catch {
      return c.json({ message: 'Failed to fetch 1RM test workout' }, 500);
    }
  }),
);

router.put(
  '/cycles/:id/1rm-test-workout',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const body = await c.req.json();
      const shouldCompleteCycle = body.isComplete === true;
      const workout = await getLatestOneRMTestWorkoutForCycle(db, userId, cycleId);
      if (!workout) {
        return c.json({ message: '1RM test workout not found' }, 404);
      }

      const updateFields = buildOneRMTestWorkoutUpdate(body);
      const filteredFields: Record<string, number> = {};
      for (const [key, value] of Object.entries(updateFields)) {
        if (value !== undefined) {
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
        await db
          .update(schema.userProgramCycles)
          .set({
            isComplete: true,
            status: 'completed',
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.userProgramCycles.id, cycleId),
              eq(schema.userProgramCycles.userId, userId),
            ),
          )
          .run();
      }

      return c.json(updatedWorkout);
    } catch {
      return c.json({ message: 'Failed to update 1RM test workout' }, 500);
    }
  }),
);

router.post(
  '/cycles/:id/workouts/current/start',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      const currentCycleWorkout = getCurrentCycleWorkout(result.cycle, result.workouts);

      if (!currentCycleWorkout) {
        return c.json({ message: 'Current workout not found' }, 404);
      }

      if (currentCycleWorkout.workoutId) {
        const existingWorkout = await db
          .select({
            id: schema.workouts.id,
            completedAt: schema.workouts.completedAt,
            isDeleted: schema.workouts.isDeleted,
          })
          .from(schema.workouts)
          .where(
            and(
              eq(schema.workouts.id, currentCycleWorkout.workoutId),
              eq(schema.workouts.userId, userId),
            ),
          )
          .get();

        if (existingWorkout && !existingWorkout.isDeleted) {
          return c.json({
            workoutId: existingWorkout.id,
            cycleWorkoutId: currentCycleWorkout.id,
            sessionName: currentCycleWorkout.sessionName,
            created: false,
            completed: !!existingWorkout.completedAt,
          });
        }
      }

      const workout = await createWorkoutFromProgramCycleWorkout(
        db,
        userId,
        cycleId,
        currentCycleWorkout,
      );

      return c.json({
        workoutId: workout.id,
        cycleWorkoutId: currentCycleWorkout.id,
        sessionName: workout.name,
        created: true,
        completed: false,
      });
    } catch {
      return c.json({ message: 'Failed to start current workout' }, 500);
    }
  }),
);

router.post(
  '/cycle-workouts/:cycleWorkoutId/start',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    try {
      const cycleWorkout = await requireOwnedProgramCycleWorkout({ userId, db }, cycleWorkoutId);
      if (cycleWorkout instanceof Response) return cycleWorkout;

      if (cycleWorkout.workoutId) {
        const existingWorkout = await db
          .select({
            id: schema.workouts.id,
            completedAt: schema.workouts.completedAt,
            isDeleted: schema.workouts.isDeleted,
          })
          .from(schema.workouts)
          .where(
            and(eq(schema.workouts.id, cycleWorkout.workoutId), eq(schema.workouts.userId, userId)),
          )
          .get();

        if (existingWorkout && !existingWorkout.isDeleted) {
          return c.json({
            workoutId: existingWorkout.id,
            sessionName: cycleWorkout.sessionName,
            created: false,
            completed: !!existingWorkout.completedAt,
            programCycleId: cycleWorkout.cycleId,
          });
        }
      }

      const workout = await createWorkoutFromProgramCycleWorkout(
        db,
        userId,
        cycleWorkout.cycleId,
        cycleWorkout,
      );

      return c.json({
        workoutId: workout.id,
        sessionName: workout.name,
        created: true,
        completed: false,
        programCycleId: cycleWorkout.cycleId,
      });
    } catch {
      return c.json({ message: 'Failed to start workout' }, 500);
    }
  }),
);

router.post(
  '/cycles/:id/complete-session',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const cycleData = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycleData instanceof Response) return cycleData;

      const totalSessionsCompleted = cycleData.totalSessionsCompleted ?? 0;
      const newSessionsCompleted = totalSessionsCompleted + 1;
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

      const result = await db
        .update(schema.userProgramCycles)
        .set({
          ...(nextCycleWorkout
            ? {
                currentWeek: nextCycleWorkout.weekNumber,
                currentSession: nextCycleWorkout.sessionNumber,
              }
            : {
                status: 'completed',
                isComplete: true,
                completedAt: new Date(),
              }),
          totalSessionsCompleted: newSessionsCompleted,
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

      if (!result) {
        return c.json({ message: 'Failed to update program cycle' }, 500);
      }
      return c.json(result);
    } catch {
      return c.json({ message: 'Failed to complete session' }, 500);
    }
  }),
);

router.put(
  '/cycle-workouts/:cycleWorkoutId/schedule',
  createHandler(async (c, { userId, db }) => {
    const cycleWorkoutId = c.req.param('cycleWorkoutId') as string;

    try {
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
        .where(eq(schema.programCycleWorkouts.id, cycleWorkoutId))
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
    } catch {
      return c.json({ message: 'Failed to schedule workout' }, 500);
    }
  }),
);

export default router;

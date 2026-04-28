import { eq, and, desc } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { getProgram, generateWorkoutSchedule } from '../programs';
import {
  createProgramCycle,
  getProgramCycleWithWorkouts,
  softDeleteProgramCycle,
} from '@strength/db';
import { getLatestOneRMsForUser } from '../lib/program-helpers';
import { getStoredUserTimezone } from '../lib/timezone';
import { getOrCreateExerciseForUser } from '@strength/db';
import { batchParallel } from '@strength/db';

const router = createRouter();

router.get('/', async (c) => {
  const { PROGRAMS } = await import('../programs');
  const programsList = Object.values(PROGRAMS).map((p) => ({
    slug: p.info.slug,
    name: p.info.name,
    description: p.info.description,
    difficulty: p.info.difficulty,
    daysPerWeek: p.info.daysPerWeek,
    estimatedWeeks: p.info.estimatedWeeks,
    totalSessions: p.info.totalSessions,
    mainLifts: p.info.mainLifts,
  }));
  return c.json(programsList);
});

router.get(
  '/latest-1rms',
  createHandler(async (c, { userId, db }) => {
    try {
      const latestOneRMs = await getLatestOneRMsForUser(db, userId);
      return c.json(latestOneRMs);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch latest 1RMs' }, 500);
    }
  }),
);

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const {
        programSlug,
        name,
        squat1rm,
        bench1rm,
        deadlift1rm,
        ohp1rm,
        preferredGymDays,
        preferredTimeOfDay,
        programStartDate,
        firstSessionDate,
      } = body;
      if (!programSlug || !name) {
        return c.json({ message: 'programSlug and name are required' }, 400);
      }

      const programConfig = getProgram(programSlug);
      if (!programConfig) {
        return c.json({ message: 'Program not found' }, 404);
      }

      const oneRMs = {
        squat: squat1rm || 0,
        bench: bench1rm || 0,
        deadlift: deadlift1rm || 0,
        ohp: ohp1rm || 0,
      };

      const generatedWorkouts = programConfig.generateWorkouts(oneRMs);

      const profileTimezone = await getStoredUserTimezone(db, userId);
      const timezone = profileTimezone ?? 'UTC';

      const startDate = programStartDate ? new Date(programStartDate) : new Date();
      const firstDate = firstSessionDate ? new Date(firstSessionDate) : undefined;
      const programStartAt = startDate.getTime();

      const scheduleOptions = {
        preferredDays: preferredGymDays || ['monday', 'wednesday', 'friday'],
        preferredTimeOfDay: preferredTimeOfDay || 'morning',
      };

      const schedule = generateWorkoutSchedule(
        generatedWorkouts.map((w) => ({
          weekNumber: w.weekNumber,
          sessionNumber: w.sessionNumber,
          sessionName: w.sessionName,
        })),
        startDate,
        { ...scheduleOptions, forceFirstSessionDate: firstDate },
      );

      const exerciseResolutionTasks: Array<{
        workoutIndex: number;
        exerciseIndex: number;
        name: string;
        lift?: string;
        libraryId?: string;
      }> = [];
      for (let wi = 0; wi < generatedWorkouts.length; wi++) {
        const workout = generatedWorkouts[wi];
        for (let ei = 0; ei < (workout.exercises ?? []).length; ei++) {
          const e = workout.exercises[ei];
          if (e.libraryId) {
            exerciseResolutionTasks.push({
              workoutIndex: wi,
              exerciseIndex: ei,
              name: e.name,
              lift: e.lift,
              libraryId: e.libraryId,
            });
          }
        }
      }

      const resolvedExercises = await batchParallel(
        exerciseResolutionTasks.map(
          (t) => () =>
            getOrCreateExerciseForUser(
              db,
              userId,
              t.name,
              t.lift as 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row' | undefined,
              t.libraryId,
            ),
        ),
      );

      const exerciseIdMap: Map<string, string> = new Map();
      for (let i = 0; i < exerciseResolutionTasks.length; i++) {
        const key = `${exerciseResolutionTasks[i].workoutIndex}_${exerciseResolutionTasks[i].exerciseIndex}`;
        exerciseIdMap.set(key, resolvedExercises[i]);
      }

      const workouts = generatedWorkouts.map((workout, workoutIndex) => {
        const scheduleEntry = schedule[workoutIndex];
        const exercises = (workout.exercises ?? []).map((e, exerciseIndex) => {
          const key = `${workoutIndex}_${exerciseIndex}`;
          return {
            name: e.name,
            lift: e.lift,
            targetWeight: e.targetWeight,
            sets: e.sets,
            reps: e.reps,
            isAmrap: e.isAmrap ?? false,
            isAccessory: false,
            libraryId: e.libraryId,
            exerciseId: exerciseIdMap.get(key),
          };
        });
        const accessories = (workout.accessories || []).map((a) => ({
          name: a.name,
          accessoryId: a.accessoryId,
          targetWeight: a.targetWeight,
          sets: a.sets,
          reps: a.reps,
          isAmrap: a.isAmrap ?? false,
          isAccessory: true,
        }));
        return {
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          sessionName: workout.sessionName,
          scheduledAt:
            scheduleEntry?.scheduledDate instanceof Date &&
            !isNaN(scheduleEntry.scheduledDate.getTime())
              ? scheduleEntry.scheduledDate.getTime()
              : undefined,
          targetLifts: JSON.stringify({
            exercises,
            accessories,
          }),
        };
      });

      const totalSessionsPlanned = generatedWorkouts.length;
      const estimatedWeeks = programConfig.info.estimatedWeeks;

      const cycle = await createProgramCycle(db, userId, {
        programSlug,
        name,
        squat1rm: squat1rm || 0,
        bench1rm: bench1rm || 0,
        deadlift1rm: deadlift1rm || 0,
        ohp1rm: ohp1rm || 0,
        totalSessionsPlanned,
        estimatedWeeks,
        preferredGymDays,
        preferredTimeOfDay,
        programStartAt,
        firstSessionAt: firstDate?.getTime(),
        workouts,
      });

      return c.json(cycle, 201);
    } catch {
      return c.json({ message: 'Failed to start program' }, 500);
    }
  }),
);

router.get(
  '/active',
  createHandler(async (c, { userId, db }) => {
    try {
      const result = await db
        .select()
        .from(schema.userProgramCycles)
        .where(
          and(
            eq(schema.userProgramCycles.userId, userId),
            eq(schema.userProgramCycles.status, 'active'),
          ),
        )
        .orderBy(desc(schema.userProgramCycles.startedAt))
        .all();
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch active program' }, 500);
    }
  }),
);

router.put(
  '/active',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const { currentWeek, currentSession } = body;
      const result = await db
        .update(schema.userProgramCycles)
        .set({
          ...(currentWeek !== undefined && { currentWeek }),
          ...(currentSession !== undefined && { currentSession }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userProgramCycles.userId, userId),
            eq(schema.userProgramCycles.status, 'active'),
          ),
        )
        .returning()
        .get();
      if (!result) {
        return c.json({ message: 'No active program found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to update program cycle' }, 500);
    }
  }),
);

router.delete(
  '/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    try {
      const deleted = await softDeleteProgramCycle(db, cycleId, userId);
      if (!deleted) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }

      return c.json({ success: true });
    } catch (_e) {
      return c.json({ message: 'Failed to delete program cycle' }, 500);
    }
  }),
);

router.get(
  '/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    try {
      const { requireOwnedProgramCycle } = await import('../api/guards');
      const cycle = await requireOwnedProgramCycle({ userId, db }, cycleId);
      if (cycle instanceof Response) return cycle;

      const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
      if (!result) {
        return c.json({ message: 'Program cycle not found' }, 404);
      }
      return c.json(result);
    } catch (_e) {
      return c.json({ message: 'Failed to fetch program cycle' }, 500);
    }
  }),
);

export default router;

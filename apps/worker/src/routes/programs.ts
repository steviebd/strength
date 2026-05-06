import { eq, and, desc } from 'drizzle-orm';
import * as schema from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';
import { getProgram, generateWorkoutSchedule } from '../programs';
import {
  createProgramCycle,
  getProgramCycleWithWorkouts,
  softDeleteProgramCycle,
  zonedDateTimeToUtc,
} from '@strength/db';
import { getLatestOneRMsForUser } from '../lib/program-helpers';
import { getStoredUserTimezone } from '../lib/timezone';
import { getOrCreateExerciseForUser } from '@strength/db';
import { getExerciseTypeByLibraryId } from '@strength/db/exercise-library';
import { batchParallel } from '@strength/db';

const router = createRouter();

function pickProgramOneRM(input: unknown, fallback: number | null | undefined) {
  return typeof input === 'number' && Number.isFinite(input) && input > 0 ? input : (fallback ?? 0);
}

// Static program metadata — intentionally public (no auth required)
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
    const latestOneRMs = await getLatestOneRMsForUser(db, userId);
    return c.json(latestOneRMs);
  }),
);

router.post(
  '/',
  createHandler(async (c, { userId, db }) => {
    const body = await c.req.json();
    const {
      id,
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

    if (typeof id === 'string' && id.trim()) {
      const existing = await db
        .select()
        .from(schema.userProgramCycles)
        .where(eq(schema.userProgramCycles.id, id))
        .get();

      if (existing && existing.userId !== userId) {
        return c.json({ message: 'Program id already exists' }, 409);
      }

      if (existing) {
        return c.json(existing, 200);
      }
    }

    const programConfig = getProgram(programSlug);
    if (!programConfig) {
      return c.json({ message: 'Program not found' }, 404);
    }

    const latestOneRMs = await getLatestOneRMsForUser(db, userId);
    const resolvedOneRMs = {
      squat1rm: pickProgramOneRM(squat1rm, latestOneRMs?.squat1rm),
      bench1rm: pickProgramOneRM(bench1rm, latestOneRMs?.bench1rm),
      deadlift1rm: pickProgramOneRM(deadlift1rm, latestOneRMs?.deadlift1rm),
      ohp1rm: pickProgramOneRM(ohp1rm, latestOneRMs?.ohp1rm),
    };

    const oneRMs = {
      squat: resolvedOneRMs.squat1rm,
      bench: resolvedOneRMs.bench1rm,
      deadlift: resolvedOneRMs.deadlift1rm,
      ohp: resolvedOneRMs.ohp1rm,
    };

    const generatedWorkouts = programConfig.generateWorkouts(oneRMs);

    const profileTimezone = await getStoredUserTimezone(db, userId);
    const timezone = profileTimezone ?? 'UTC';

    const startDate = programStartDate
      ? zonedDateTimeToUtc(programStartDate, timezone, '00:00:00')
      : new Date();
    const firstDate = firstSessionDate
      ? zonedDateTimeToUtc(firstSessionDate, timezone, '00:00:00')
      : undefined;
    const programStartAt = startDate.getTime();

    const scheduleOptions = {
      preferredDays: preferredGymDays?.length
        ? preferredGymDays
        : ['monday', 'wednesday', 'friday'],
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
        const exerciseType = e.libraryId
          ? getExerciseTypeByLibraryId(e.libraryId)
          : (e.exerciseType ?? 'weighted');
        return {
          name: e.name,
          lift: e.lift,
          targetWeight: e.targetWeight,
          sets: e.sets,
          reps: e.reps,
          exerciseType,
          targetDuration: e.targetDuration ?? null,
          targetDistance: e.targetDistance ?? null,
          targetHeight: e.targetHeight ?? null,
          isAmrap: e.isAmrap ?? false,
          isAccessory: false,
          libraryId: e.libraryId,
          exerciseId: exerciseIdMap.get(key),
        };
      });
      const accessories = (workout.accessories || []).map((a) => {
        const exerciseType = a.libraryId
          ? getExerciseTypeByLibraryId(a.libraryId)
          : (a.exerciseType ?? 'weighted');
        return {
          name: a.name,
          accessoryId: a.accessoryId,
          libraryId: a.libraryId,
          targetWeight: a.targetWeight,
          sets: a.sets,
          reps: a.reps,
          exerciseType,
          targetDuration: a.targetDuration ?? null,
          targetDistance: a.targetDistance ?? null,
          targetHeight: a.targetHeight ?? null,
          isAmrap: a.isAmrap ?? false,
          isAccessory: true,
        };
      });
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
      squat1rm: resolvedOneRMs.squat1rm,
      bench1rm: resolvedOneRMs.bench1rm,
      deadlift1rm: resolvedOneRMs.deadlift1rm,
      ohp1rm: resolvedOneRMs.ohp1rm,
      totalSessionsPlanned,
      estimatedWeeks,
      preferredGymDays,
      preferredTimeOfDay,
      programStartAt,
      firstSessionAt: firstDate?.getTime(),
      workouts,
      id,
    });

    return c.json(cycle, 201);
  }),
);

router.get(
  '/active',
  createHandler(async (c, { userId, db }) => {
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
  }),
);

router.put(
  '/active',
  createHandler(async (c, { userId, db }) => {
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
  }),
);

router.delete(
  '/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;

    const deleted = await softDeleteProgramCycle(db, cycleId, userId);
    if (!deleted) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }

    return c.json({ success: true });
  }),
);

router.get(
  '/cycles/:id',
  createHandler(async (c, { userId, db }) => {
    const cycleId = c.req.param('id') as string;
    const { requireOwnedRecord } = await import('../api/guards');
    const cycle = await requireOwnedRecord({ userId, db }, schema.userProgramCycles, cycleId, {
      notFoundBody: { message: 'Program cycle not found' },
    });
    if (cycle instanceof Response) return cycle;

    const result = await getProgramCycleWithWorkouts(db, cycleId, userId);
    if (!result) {
      return c.json({ message: 'Program cycle not found' }, 404);
    }
    return c.json(result);
  }),
);

export default router;

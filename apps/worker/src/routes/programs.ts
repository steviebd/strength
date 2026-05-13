import { eq, and, desc, inArray } from 'drizzle-orm';
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
import { batchParallel } from '@strength/db';
import { resolveToUserExerciseId } from '../lib/program-helpers';

const router = createRouter();

type PreferredDay =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

type CustomProgramPayload = {
  name?: unknown;
  description?: unknown;
  weeks?: unknown;
  daysPerWeek?: unknown;
  requiresOneRm?: unknown;
  days?: unknown;
};

type ValidCustomProgramPayload = {
  name: string;
  description: string | null;
  weeks: number;
  daysPerWeek: number;
  requiresOneRm: boolean;
  days: Array<{
    name: string;
    exercises: Array<{
      exerciseId: string;
      sets: number;
      reps: number | null;
      startingWeight: number | null;
      incrementWeight: number;
      targetDistance: number | null;
      targetHeight: number | null;
      progressionMode: 'session' | 'week';
      isAmrap: boolean;
    }>;
  }>;
};

function pickProgramOneRM(input: unknown, fallback: number | null | undefined) {
  return typeof input === 'number' && Number.isFinite(input) && input > 0 ? input : (fallback ?? 0);
}

function isPositiveInteger(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function parseCustomProgramPayload(body: CustomProgramPayload): {
  value?: ValidCustomProgramPayload;
  error?: string;
} {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Name is required' };

  if (!isPositiveInteger(body.weeks, 1, 52)) {
    return { error: 'weeks must be a whole number between 1 and 52' };
  }
  if (!isPositiveInteger(body.daysPerWeek, 1, 7)) {
    return { error: 'daysPerWeek must be a whole number between 1 and 7' };
  }
  if (!Array.isArray(body.days) || body.days.length !== body.daysPerWeek) {
    return { error: 'days must match daysPerWeek' };
  }

  const days: ValidCustomProgramPayload['days'] = [];
  for (let dayIndex = 0; dayIndex < body.days.length; dayIndex++) {
    const rawDay = body.days[dayIndex] as any;
    const dayName =
      typeof rawDay?.name === 'string' && rawDay.name.trim()
        ? rawDay.name.trim()
        : `Day ${dayIndex + 1}`;
    if (!Array.isArray(rawDay?.exercises) || rawDay.exercises.length === 0) {
      return { error: `${dayName} must include at least one exercise` };
    }

    const exercises: ValidCustomProgramPayload['days'][number]['exercises'] = [];
    for (const rawExercise of rawDay.exercises) {
      const exerciseId =
        typeof rawExercise?.exerciseId === 'string' ? rawExercise.exerciseId.trim() : '';
      if (!exerciseId) return { error: 'Every exercise must include exerciseId' };

      if (!isPositiveInteger(rawExercise.sets, 1, 20)) {
        return { error: 'sets must be a whole number between 1 and 20' };
      }

      const isAmrap = rawExercise.isAmrap === true;
      let reps: number | null = null;
      if (!isAmrap) {
        if (rawExercise.reps == null || rawExercise.reps === '') {
          reps = null;
        } else if (Number.isInteger(rawExercise.reps) && rawExercise.reps >= 0) {
          reps = rawExercise.reps;
        } else {
          return { error: 'reps must be a whole number' };
        }
      }

      const startingWeight =
        typeof rawExercise.startingWeight === 'number' &&
        Number.isFinite(rawExercise.startingWeight) &&
        rawExercise.startingWeight >= 0
          ? rawExercise.startingWeight
          : null;
      const incrementWeight =
        typeof rawExercise.incrementWeight === 'number' &&
        Number.isFinite(rawExercise.incrementWeight) &&
        rawExercise.incrementWeight >= 0
          ? rawExercise.incrementWeight
          : 0;
      const targetDistance =
        typeof rawExercise.targetDistance === 'number' &&
        Number.isFinite(rawExercise.targetDistance) &&
        rawExercise.targetDistance >= 0
          ? rawExercise.targetDistance
          : null;
      const targetHeight =
        typeof rawExercise.targetHeight === 'number' &&
        Number.isFinite(rawExercise.targetHeight) &&
        rawExercise.targetHeight >= 0
          ? rawExercise.targetHeight
          : null;
      const progressionMode = rawExercise.progressionMode === 'week' ? 'week' : 'session';

      exercises.push({
        exerciseId,
        sets: rawExercise.sets,
        reps,
        startingWeight,
        incrementWeight,
        targetDistance,
        targetHeight,
        progressionMode,
        isAmrap,
      });
    }

    days.push({ name: dayName, exercises });
  }

  return {
    value: {
      name,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      weeks: body.weeks as number,
      daysPerWeek: body.daysPerWeek as number,
      requiresOneRm: typeof body.requiresOneRm === 'boolean' ? body.requiresOneRm : true,
      days,
    },
  };
}

async function insertCustomProgramDefinition(
  db: any,
  userId: string,
  payload: ValidCustomProgramPayload,
) {
  const now = new Date();
  const customProgram = await db
    .insert(schema.customPrograms)
    .values({
      userId,
      name: payload.name,
      description: payload.description,
      weeks: payload.weeks,
      daysPerWeek: payload.daysPerWeek,
      requiresOneRm: payload.requiresOneRm,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();

  for (let dayIndex = 0; dayIndex < payload.days.length; dayIndex++) {
    const day = payload.days[dayIndex];
    const createdDay = await db
      .insert(schema.customProgramDays)
      .values({
        customProgramId: customProgram.id,
        dayIndex,
        name: day.name,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    const exerciseRows = [];
    for (let orderIndex = 0; orderIndex < day.exercises.length; orderIndex++) {
      const exercise = day.exercises[orderIndex];
      const resolvedExerciseId = await resolveOwnedExerciseId(db, userId, exercise.exerciseId);
      exerciseRows.push({
        customProgramDayId: createdDay.id,
        exerciseId: resolvedExerciseId,
        orderIndex,
        sets: exercise.sets,
        reps: exercise.reps,
        startingWeight: exercise.startingWeight,
        incrementWeight: exercise.incrementWeight,
        targetDistance: exercise.targetDistance,
        targetHeight: exercise.targetHeight,
        progressionMode: exercise.progressionMode,
        isAmrap: exercise.isAmrap,
        createdAt: now,
        updatedAt: now,
      });
    }
    await db.insert(schema.customProgramExercises).values(exerciseRows).run();
  }

  return getCustomProgramDetail(db, userId, customProgram.id);
}

async function resolveOwnedExerciseId(db: any, userId: string, exerciseId: string) {
  const resolvedExerciseId = await resolveToUserExerciseId(db, userId, exerciseId);
  const owned = await db
    .select({ id: schema.exercises.id })
    .from(schema.exercises)
    .where(
      and(
        eq(schema.exercises.id, resolvedExerciseId),
        eq(schema.exercises.userId, userId),
        eq(schema.exercises.isDeleted, false),
      ),
    )
    .get();
  if (!owned) {
    throw new Error('Exercise not found');
  }
  return resolvedExerciseId;
}

async function getCustomProgramDetail(db: any, userId: string, customProgramId: string) {
  const program = await db
    .select()
    .from(schema.customPrograms)
    .where(
      and(
        eq(schema.customPrograms.id, customProgramId),
        eq(schema.customPrograms.userId, userId),
        eq(schema.customPrograms.isDeleted, false),
      ),
    )
    .get();

  if (!program) return null;

  const days = await db
    .select()
    .from(schema.customProgramDays)
    .where(eq(schema.customProgramDays.customProgramId, customProgramId))
    .orderBy(schema.customProgramDays.dayIndex)
    .all();

  const dayIds = days.map((day: any) => day.id);
  const exercises =
    dayIds.length > 0
      ? await db
          .select({
            id: schema.customProgramExercises.id,
            customProgramDayId: schema.customProgramExercises.customProgramDayId,
            exerciseId: schema.customProgramExercises.exerciseId,
            orderIndex: schema.customProgramExercises.orderIndex,
            sets: schema.customProgramExercises.sets,
            reps: schema.customProgramExercises.reps,
            startingWeight: schema.customProgramExercises.startingWeight,
            incrementWeight: schema.customProgramExercises.incrementWeight,
            targetDistance: schema.customProgramExercises.targetDistance,
            targetHeight: schema.customProgramExercises.targetHeight,
            progressionMode: schema.customProgramExercises.progressionMode,
            isAmrap: schema.customProgramExercises.isAmrap,
            exerciseName: schema.exercises.name,
            muscleGroup: schema.exercises.muscleGroup,
            libraryId: schema.exercises.libraryId,
            exerciseType: schema.exercises.exerciseType,
          })
          .from(schema.customProgramExercises)
          .innerJoin(
            schema.exercises,
            eq(schema.customProgramExercises.exerciseId, schema.exercises.id),
          )
          .where(inArray(schema.customProgramExercises.customProgramDayId, dayIds))
          .orderBy(
            schema.customProgramExercises.customProgramDayId,
            schema.customProgramExercises.orderIndex,
          )
          .all()
      : [];

  const exercisesByDay = new Map<string, typeof exercises>();
  for (const exercise of exercises) {
    const list = exercisesByDay.get(exercise.customProgramDayId) ?? [];
    list.push(exercise);
    exercisesByDay.set(exercise.customProgramDayId, list);
  }

  return {
    ...program,
    days: days.map((day: any) => ({
      id: day.id,
      dayIndex: day.dayIndex,
      name: day.name,
      exercises: (exercisesByDay.get(day.id) ?? []).map((exercise: any) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        orderIndex: exercise.orderIndex,
        sets: exercise.sets,
        reps: exercise.reps,
        startingWeight: exercise.startingWeight,
        incrementWeight: exercise.incrementWeight,
        targetDistance: exercise.targetDistance,
        targetHeight: exercise.targetHeight,
        progressionMode: exercise.progressionMode,
        isAmrap: exercise.isAmrap,
        exercise: {
          id: exercise.exerciseId,
          name: exercise.exerciseName,
          muscleGroup: exercise.muscleGroup,
          libraryId: exercise.libraryId,
          exerciseType: exercise.exerciseType,
        },
      })),
    })),
  };
}

function buildCustomProgramWorkouts(
  customProgram: Awaited<ReturnType<typeof getCustomProgramDetail>>,
) {
  if (!customProgram) return [];

  const occurrenceByExerciseId = new Map<string, number>();
  const lastProgressionByExerciseId = new Map<string, number>();
  const workouts = [];
  for (let weekNumber = 1; weekNumber <= customProgram.weeks; weekNumber++) {
    for (const day of customProgram.days) {
      const sessionNumber = (weekNumber - 1) * customProgram.daysPerWeek + day.dayIndex + 1;
      const exercises = day.exercises.map((exercise: any) => {
        const occurrence = occurrenceByExerciseId.get(exercise.exerciseId) ?? 0;
        const progressionStep = exercise.isAmrap
          ? (lastProgressionByExerciseId.get(exercise.exerciseId) ?? occurrence)
          : exercise.progressionMode === 'week'
            ? weekNumber - 1
            : occurrence;
        if (!exercise.isAmrap) {
          occurrenceByExerciseId.set(exercise.exerciseId, occurrence + 1);
          lastProgressionByExerciseId.set(exercise.exerciseId, progressionStep);
        }
        const targetWeight =
          exercise.exercise.exerciseType !== 'bodyweight' &&
          exercise.exercise.exerciseType !== 'timed' &&
          exercise.exercise.exerciseType !== 'cardio' &&
          exercise.exercise.exerciseType !== 'plyo' &&
          typeof exercise.startingWeight === 'number'
            ? exercise.startingWeight + exercise.incrementWeight * progressionStep
            : null;
        const targetReps =
          exercise.exercise.exerciseType === 'bodyweight' ||
          exercise.exercise.exerciseType === 'plyo'
            ? (exercise.reps ?? 0) + exercise.incrementWeight * progressionStep
            : exercise.reps;
        const targetDuration =
          exercise.exercise.exerciseType === 'timed' || exercise.exercise.exerciseType === 'cardio'
            ? (exercise.startingWeight ?? 0) + exercise.incrementWeight * progressionStep
            : null;
        const targetDistance =
          exercise.exercise.exerciseType === 'cardio' ? (exercise.targetDistance ?? null) : null;
        const targetHeight =
          exercise.exercise.exerciseType === 'plyo' ? (exercise.targetHeight ?? null) : null;

        return {
          name: exercise.exercise.name,
          exerciseId: exercise.exerciseId,
          libraryId: exercise.exercise.libraryId ?? undefined,
          targetWeight,
          addedWeight: 0,
          targetDuration,
          targetDistance,
          targetHeight,
          sets: exercise.sets,
          reps: exercise.isAmrap ? 'AMRAP' : targetReps == null ? null : Math.round(targetReps),
          isAmrap: exercise.isAmrap,
          isAccessory: false,
          isRequired: true,
        };
      });

      workouts.push({
        weekNumber,
        sessionNumber,
        sessionName: `${customProgram.name} - Week ${weekNumber} - ${day.name}`,
        exercises,
      });
    }
  }
  return workouts;
}

router.get(
  '/',
  createHandler(async (c, { userId, db }) => {
    const { PROGRAMS } = await import('../programs');
    const customPrograms = await db
      .select()
      .from(schema.customPrograms)
      .where(
        and(eq(schema.customPrograms.userId, userId), eq(schema.customPrograms.isDeleted, false)),
      )
      .orderBy(desc(schema.customPrograms.updatedAt))
      .all();

    const customList = customPrograms.map((p) => ({
      slug: `custom:${p.id}`,
      customProgramId: p.id,
      source: 'custom',
      name: p.name,
      description: p.description ?? 'Custom training program',
      difficulty: 'custom',
      daysPerWeek: p.daysPerWeek,
      requiresOneRm: p.requiresOneRm ?? true,
      estimatedWeeks: p.weeks,
      totalSessions: p.weeks * p.daysPerWeek,
      mainLifts: [],
    }));

    const programsList = Object.values(PROGRAMS).map((p) => ({
      slug: p.info.slug,
      source: 'prebuilt',
      name: p.info.name,
      description: p.info.description,
      difficulty: p.info.difficulty,
      daysPerWeek: p.info.daysPerWeek,
      estimatedWeeks: p.info.estimatedWeeks,
      totalSessions: p.info.totalSessions,
      mainLifts: p.info.mainLifts,
    }));
    return c.json([...customList, ...programsList]);
  }),
);

router.post(
  '/custom',
  createHandler(async (c, { userId, db }) => {
    try {
      const body = await c.req.json();
      const parsed = parseCustomProgramPayload(body);
      if (!parsed.value) {
        return c.json({ message: parsed.error ?? 'Invalid custom program' }, 400);
      }
      const program = await insertCustomProgramDefinition(db, userId, parsed.value);
      return c.json(program, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create custom program';
      const status = message === 'Exercise not found' ? 404 : 500;
      return c.json({ message }, status);
    }
  }),
);

router.get(
  '/custom/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const program = await getCustomProgramDetail(db, userId, id);
      if (!program) return c.json({ message: 'Custom program not found' }, 404);
      return c.json(program);
    } catch {
      return c.json({ message: 'Failed to fetch custom program' }, 500);
    }
  }),
);

router.put(
  '/custom/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const existing = await getCustomProgramDetail(db, userId, id);
      if (!existing) return c.json({ message: 'Custom program not found' }, 404);
      const body = await c.req.json();
      const parsed = parseCustomProgramPayload(body);
      if (!parsed.value) {
        return c.json({ message: parsed.error ?? 'Invalid custom program' }, 400);
      }

      await db
        .delete(schema.customProgramDays)
        .where(eq(schema.customProgramDays.customProgramId, id))
        .run();
      await db
        .update(schema.customPrograms)
        .set({
          name: parsed.value.name,
          description: parsed.value.description,
          weeks: parsed.value.weeks,
          daysPerWeek: parsed.value.daysPerWeek,
          requiresOneRm: parsed.value.requiresOneRm,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.customPrograms.id, id), eq(schema.customPrograms.userId, userId)))
        .run();

      const now = new Date();
      for (let dayIndex = 0; dayIndex < parsed.value.days.length; dayIndex++) {
        const day = parsed.value.days[dayIndex];
        const createdDay = await db
          .insert(schema.customProgramDays)
          .values({
            customProgramId: id,
            dayIndex,
            name: day.name,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get();
        const rows = [];
        for (let orderIndex = 0; orderIndex < day.exercises.length; orderIndex++) {
          const exercise = day.exercises[orderIndex];
          const resolvedExerciseId = await resolveOwnedExerciseId(db, userId, exercise.exerciseId);
          rows.push({
            customProgramDayId: createdDay.id,
            exerciseId: resolvedExerciseId,
            orderIndex,
            sets: exercise.sets,
            reps: exercise.reps,
            startingWeight: exercise.startingWeight,
            incrementWeight: exercise.incrementWeight,
            targetDistance: exercise.targetDistance,
            targetHeight: exercise.targetHeight,
            progressionMode: exercise.progressionMode,
            isAmrap: exercise.isAmrap,
            createdAt: now,
            updatedAt: now,
          });
        }
        await db.insert(schema.customProgramExercises).values(rows).run();
      }

      const updated = await getCustomProgramDetail(db, userId, id);
      return c.json(updated);
    } catch {
      return c.json({ message: 'Failed to update custom program' }, 500);
    }
  }),
);

router.delete(
  '/custom/:id',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      await db
        .update(schema.customPrograms)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(schema.customPrograms.id, id), eq(schema.customPrograms.userId, userId)))
        .run();
      return c.json({ success: true });
    } catch {
      return c.json({ message: 'Failed to delete custom program' }, 500);
    }
  }),
);

router.post(
  '/custom/:id/start',
  createHandler(async (c, { userId, db }) => {
    const id = c.req.param('id') as string;
    try {
      const body = await c.req.json();
      const {
        name,
        preferredGymDays,
        preferredTimeOfDay,
        programStartDate,
        firstSessionDate,
        squat1rm,
        bench1rm,
        deadlift1rm,
        ohp1rm,
      } = body;
      const customProgram = await getCustomProgramDetail(db, userId, id);
      if (!customProgram) return c.json({ message: 'Custom program not found' }, 404);

      const profileTimezone = await getStoredUserTimezone(db, userId);
      const timezone = profileTimezone ?? 'UTC';
      const startDate = programStartDate
        ? zonedDateTimeToUtc(programStartDate, timezone, '00:00:00')
        : new Date();
      const firstDate = firstSessionDate
        ? zonedDateTimeToUtc(firstSessionDate, timezone, '00:00:00')
        : undefined;

      const generatedWorkouts = buildCustomProgramWorkouts(customProgram);
      const latestOneRMs = customProgram.requiresOneRm
        ? await getLatestOneRMsForUser(db, userId)
        : null;
      const resolvedOneRMs = {
        squat1rm: customProgram.requiresOneRm
          ? pickProgramOneRM(squat1rm, latestOneRMs?.squat1rm)
          : 0,
        bench1rm: customProgram.requiresOneRm
          ? pickProgramOneRM(bench1rm, latestOneRMs?.bench1rm)
          : 0,
        deadlift1rm: customProgram.requiresOneRm
          ? pickProgramOneRM(deadlift1rm, latestOneRMs?.deadlift1rm)
          : 0,
        ohp1rm: customProgram.requiresOneRm ? pickProgramOneRM(ohp1rm, latestOneRMs?.ohp1rm) : 0,
      };
      const scheduleOptions = {
        preferredDays: (preferredGymDays || ['monday', 'wednesday', 'friday']) as PreferredDay[],
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

      const workouts = generatedWorkouts.map((workout, workoutIndex) => {
        const scheduleEntry = schedule[workoutIndex];
        return {
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
          sessionName: workout.sessionName,
          scheduledAt:
            scheduleEntry?.scheduledDate instanceof Date &&
            !isNaN(scheduleEntry.scheduledDate.getTime())
              ? scheduleEntry.scheduledDate.getTime()
              : undefined,
          targetLifts: JSON.stringify({ exercises: workout.exercises, accessories: [] }),
        };
      });

      const cycle = await createProgramCycle(db, userId, {
        programSlug: `custom:${id}`,
        name: typeof name === 'string' && name.trim() ? name.trim() : customProgram.name,
        squat1rm: resolvedOneRMs.squat1rm,
        bench1rm: resolvedOneRMs.bench1rm,
        deadlift1rm: resolvedOneRMs.deadlift1rm,
        ohp1rm: resolvedOneRMs.ohp1rm,
        totalSessionsPlanned: workouts.length,
        estimatedWeeks: customProgram.weeks,
        preferredGymDays,
        preferredTimeOfDay,
        programStartAt: startDate.getTime(),
        firstSessionAt: firstDate?.getTime(),
        workouts,
      });

      return c.json(cycle, 201);
    } catch {
      return c.json({ message: 'Failed to start custom program' }, 500);
    }
  }),
);

router.get(
  '/latest-1rms',
  createHandler(async (c, { userId, db }) => {
    try {
      const latestOneRMs = await getLatestOneRMsForUser(db, userId);
      return c.json(latestOneRMs);
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
      return c.json({ message: 'Failed to fetch program cycle' }, 500);
    }
  }),
);

export default router;

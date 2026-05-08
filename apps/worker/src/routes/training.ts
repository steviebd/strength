import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import * as schema from '@strength/db';
import { chunkedQueryMany } from '@strength/db';
import { createRouter } from '../lib/router';
import { createHandler } from '../api/auth';

const router = createRouter();

function parseLimit(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 200);
}

async function listTemplatesForSnapshot(db: any, userId: string) {
  const templates = await db
    .select({
      id: schema.templates.id,
      name: schema.templates.name,
      description: schema.templates.description,
      notes: schema.templates.notes,
      defaultWeightIncrement: schema.templates.defaultWeightIncrement,
      defaultBodyweightIncrement: schema.templates.defaultBodyweightIncrement,
      defaultCardioIncrement: schema.templates.defaultCardioIncrement,
      defaultTimedIncrement: schema.templates.defaultTimedIncrement,
      defaultPlyoIncrement: schema.templates.defaultPlyoIncrement,
      createdAt: schema.templates.createdAt,
      updatedAt: schema.templates.updatedAt,
    })
    .from(schema.templates)
    .where(and(eq(schema.templates.userId, userId), eq(schema.templates.isDeleted, false)))
    .orderBy(desc(schema.templates.createdAt))
    .limit(50)
    .all();

  const templateIds = templates.map((template: any) => template.id);
  const templateExercises =
    templateIds.length > 0
      ? await chunkedQueryMany(db, {
          ids: templateIds,
          builder: (chunk) =>
            db
              .select({
                templateId: schema.templateExercises.templateId,
                id: schema.templateExercises.id,
                exerciseId: schema.templateExercises.exerciseId,
                name: schema.exercises.name,
                muscleGroup: schema.exercises.muscleGroup,
                libraryId: schema.exercises.libraryId,
                sets: schema.templateExercises.sets,
                reps: schema.templateExercises.reps,
                targetWeight: schema.templateExercises.targetWeight,
                addedWeight: schema.templateExercises.addedWeight,
                repsRaw: schema.templateExercises.repsRaw,
                exerciseType: schema.templateExercises.exerciseType,
                targetDuration: schema.templateExercises.targetDuration,
                targetDistance: schema.templateExercises.targetDistance,
                targetHeight: schema.templateExercises.targetHeight,
                isAmrap: schema.templateExercises.isAmrap,
                isAccessory: schema.templateExercises.isAccessory,
                isRequired: schema.templateExercises.isRequired,
                orderIndex: schema.templateExercises.orderIndex,
              })
              .from(schema.templateExercises)
              .innerJoin(
                schema.exercises,
                eq(schema.templateExercises.exerciseId, schema.exercises.id),
              )
              .where(inArray(schema.templateExercises.templateId, chunk))
              .orderBy(schema.templateExercises.orderIndex)
              .all(),
        })
      : [];

  const exercisesByTemplate = new Map<string, any[]>();
  for (const exercise of templateExercises as any[]) {
    const list = exercisesByTemplate.get(exercise.templateId) ?? [];
    list.push(exercise);
    exercisesByTemplate.set(exercise.templateId, list);
  }

  return templates.map((template: any) => ({
    ...template,
    exercises: (exercisesByTemplate.get(template.id) ?? []).map(
      ({ templateId: _templateId, ...exercise }) => exercise,
    ),
  }));
}

async function listUserExercisesForSnapshot(db: any, userId: string) {
  return db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.name,
      muscleGroup: schema.exercises.muscleGroup,
      description: schema.exercises.description,
      libraryId: schema.exercises.libraryId,
      exerciseType: schema.exercises.exerciseType,
      isAmrap: schema.exercises.isAmrap,
      createdAt: schema.exercises.createdAt,
      updatedAt: schema.exercises.updatedAt,
    })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.userId, userId), eq(schema.exercises.isDeleted, false)))
    .orderBy(desc(schema.exercises.createdAt))
    .limit(200)
    .all();
}

async function listActiveProgramCyclesForSnapshot(db: any, userId: string) {
  const cycles = await db
    .select({
      id: schema.userProgramCycles.id,
      name: schema.userProgramCycles.name,
      programSlug: schema.userProgramCycles.programSlug,
      currentWeek: schema.userProgramCycles.currentWeek,
      currentSession: schema.userProgramCycles.currentSession,
      status: schema.userProgramCycles.status,
      isComplete: schema.userProgramCycles.isComplete,
      startedAt: schema.userProgramCycles.startedAt,
      updatedAt: schema.userProgramCycles.updatedAt,
      squat1rm: schema.userProgramCycles.squat1rm,
      bench1rm: schema.userProgramCycles.bench1rm,
      deadlift1rm: schema.userProgramCycles.deadlift1rm,
      ohp1rm: schema.userProgramCycles.ohp1rm,
    })
    .from(schema.userProgramCycles)
    .where(
      and(
        eq(schema.userProgramCycles.userId, userId),
        eq(schema.userProgramCycles.status, 'active'),
      ),
    )
    .orderBy(desc(schema.userProgramCycles.startedAt))
    .all();

  const cycleIds = cycles.map((cycle: any) => cycle.id);
  const workouts =
    cycleIds.length > 0
      ? await chunkedQueryMany(db, {
          ids: cycleIds,
          builder: (chunk) =>
            db
              .select({
                id: schema.programCycleWorkouts.id,
                cycleId: schema.programCycleWorkouts.cycleId,
                weekNumber: schema.programCycleWorkouts.weekNumber,
                sessionNumber: schema.programCycleWorkouts.sessionNumber,
                sessionName: schema.programCycleWorkouts.sessionName,
                workoutId: schema.programCycleWorkouts.workoutId,
                scheduledAt: schema.programCycleWorkouts.scheduledAt,
                isComplete: schema.programCycleWorkouts.isComplete,
                targetLifts: schema.programCycleWorkouts.targetLifts,
                updatedAt: schema.programCycleWorkouts.updatedAt,
              })
              .from(schema.programCycleWorkouts)
              .where(inArray(schema.programCycleWorkouts.cycleId, chunk))
              .orderBy(
                schema.programCycleWorkouts.weekNumber,
                schema.programCycleWorkouts.sessionNumber,
              )
              .all(),
        })
      : [];

  const workoutsByCycle = new Map<string, any[]>();
  for (const workout of workouts as any[]) {
    const list = workoutsByCycle.get(workout.cycleId) ?? [];
    list.push(workout);
    workoutsByCycle.set(workout.cycleId, list);
  }

  return cycles.map((cycle: any) => ({
    cycle,
    workouts: workoutsByCycle.get(cycle.id) ?? [],
  }));
}

async function listRecentWorkoutsForSnapshot(db: any, userId: string, limit: number) {
  const workouts = await db
    .select({
      id: schema.workouts.id,
      workoutType: schema.workouts.workoutType,
      templateId: schema.workouts.templateId,
      programCycleId: schema.workouts.programCycleId,
      name: schema.workouts.name,
      notes: schema.workouts.notes,
      startedAt: schema.workouts.startedAt,
      completedAt: schema.workouts.completedAt,
      totalVolume: schema.workouts.totalVolume,
      totalSets: schema.workouts.totalSets,
      durationMinutes: schema.workouts.durationMinutes,
      createdAt: schema.workouts.createdAt,
      updatedAt: schema.workouts.updatedAt,
    })
    .from(schema.workouts)
    .where(and(eq(schema.workouts.userId, userId), eq(schema.workouts.isDeleted, false)))
    .orderBy(desc(schema.workouts.startedAt))
    .limit(limit)
    .all();

  const workoutIds = workouts.map((workout: any) => workout.id);
  const workoutExercises =
    workoutIds.length > 0
      ? await chunkedQueryMany(db, {
          ids: workoutIds,
          builder: (chunk) =>
            db
              .select({
                id: schema.workoutExercises.id,
                workoutId: schema.workoutExercises.workoutId,
                exerciseId: schema.workoutExercises.exerciseId,
                orderIndex: schema.workoutExercises.orderIndex,
                notes: schema.workoutExercises.notes,
                isAmrap: schema.workoutExercises.isAmrap,
                name: schema.exercises.name,
                muscleGroup: schema.exercises.muscleGroup,
                libraryId: schema.exercises.libraryId,
              })
              .from(schema.workoutExercises)
              .innerJoin(
                schema.exercises,
                eq(schema.workoutExercises.exerciseId, schema.exercises.id),
              )
              .where(inArray(schema.workoutExercises.workoutId, chunk))
              .orderBy(schema.workoutExercises.orderIndex)
              .all(),
        })
      : [];

  const workoutExerciseIds = workoutExercises.map((exercise: any) => exercise.id);
  const sets =
    workoutExerciseIds.length > 0
      ? await chunkedQueryMany(db, {
          ids: workoutExerciseIds,
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
              })
              .from(schema.workoutSets)
              .where(inArray(schema.workoutSets.workoutExerciseId, chunk))
              .orderBy(schema.workoutSets.setNumber)
              .all(),
        })
      : [];

  const setsByExercise = new Map<string, any[]>();
  for (const set of sets as any[]) {
    const list = setsByExercise.get(set.workoutExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.workoutExerciseId, list);
  }

  const exercisesByWorkout = new Map<string, any[]>();
  for (const exercise of workoutExercises as any[]) {
    const list = exercisesByWorkout.get(exercise.workoutId) ?? [];
    list.push({
      ...exercise,
      sets: setsByExercise.get(exercise.id) ?? [],
    });
    exercisesByWorkout.set(exercise.workoutId, list);
  }

  return workouts.map((workout: any) => ({
    ...workout,
    exerciseCount: exercisesByWorkout.get(workout.id)?.length ?? 0,
    exercises: exercisesByWorkout.get(workout.id) ?? [],
  }));
}

router.get(
  '/offline-snapshot',
  createHandler(async (c, { userId, db }) => {
    const recentWorkoutLimit = parseLimit(c.req.query('recentWorkoutLimit'), 20);

    const templateMax = await db
      .select({ max: sql`max(${schema.templates.updatedAt})` })
      .from(schema.templates)
      .where(and(eq(schema.templates.userId, userId), eq(schema.templates.isDeleted, false)))
      .get();
    const exerciseMax = await db
      .select({ max: sql`max(${schema.exercises.updatedAt})` })
      .from(schema.exercises)
      .where(and(eq(schema.exercises.userId, userId), eq(schema.exercises.isDeleted, false)))
      .get();
    const cycleMax = await db
      .select({ max: sql`max(${schema.userProgramCycles.updatedAt})` })
      .from(schema.userProgramCycles)
      .where(
        and(
          eq(schema.userProgramCycles.userId, userId),
          eq(schema.userProgramCycles.status, 'active'),
        ),
      )
      .get();
    const workoutsMax = await db
      .select({ max: sql`max(${schema.workouts.updatedAt})` })
      .from(schema.workouts)
      .where(and(eq(schema.workouts.userId, userId), eq(schema.workouts.isDeleted, false)))
      .get();

    const timestamps = [templateMax?.max, exerciseMax?.max, cycleMax?.max, workoutsMax?.max]
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime());
    const maxTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;
    const etag = `"${maxTimestamp}"`;

    const ifNoneMatch = c.req.header('If-None-Match');
    if (ifNoneMatch === etag) {
      c.header('ETag', etag);
      c.header('Cache-Control', 'private, max-age=30');
      return c.body(null, 304);
    }

    const [templates, userExercises, activeProgramCycles, recentWorkouts] = await Promise.all([
      listTemplatesForSnapshot(db, userId),
      listUserExercisesForSnapshot(db, userId),
      listActiveProgramCyclesForSnapshot(db, userId),
      listRecentWorkoutsForSnapshot(db, userId, recentWorkoutLimit),
    ]);

    c.header('ETag', etag);
    return c.json({
      generatedAt: new Date().toISOString(),
      templates,
      userExercises,
      activeProgramCycles,
      recentWorkouts,
    });
  }),
);

export default router;

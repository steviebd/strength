import { and, desc, eq, inArray } from 'drizzle-orm';
import * as schema from '@strength/db';
import { chunkedQueryMany, getProgramCycleWithWorkouts } from '@strength/db';
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
      createdAt: schema.templates.createdAt,
      updatedAt: schema.templates.updatedAt,
    })
    .from(schema.templates)
    .where(and(eq(schema.templates.userId, userId), eq(schema.templates.isDeleted, false)))
    .orderBy(desc(schema.templates.createdAt))
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
      createdAt: schema.exercises.createdAt,
      updatedAt: schema.exercises.updatedAt,
    })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.userId, userId), eq(schema.exercises.isDeleted, false)))
    .orderBy(desc(schema.exercises.createdAt))
    .all();
}

async function listActiveProgramCyclesForSnapshot(db: any, userId: string) {
  const cycles = await db
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

  const result = [];
  for (const cycle of cycles) {
    const cycleWithWorkouts = await getProgramCycleWithWorkouts(db, cycle.id, userId);
    if (cycleWithWorkouts) {
      result.push(cycleWithWorkouts);
    }
  }
  return result;
}

async function listRecentWorkoutsForSnapshot(db: any, userId: string, limit: number) {
  const workouts = await db
    .select()
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
              .select()
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
    const recentWorkoutLimit = parseLimit(c.req.query('recentWorkoutLimit'), 50);
    const [templates, userExercises, activeProgramCycles, recentWorkouts] = await Promise.all([
      listTemplatesForSnapshot(db, userId),
      listUserExercisesForSnapshot(db, userId),
      listActiveProgramCyclesForSnapshot(db, userId),
      listRecentWorkoutsForSnapshot(db, userId, recentWorkoutLimit),
    ]);

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

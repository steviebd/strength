import { and, eq } from 'drizzle-orm';
import * as schema from '@strength/db';
import type { AppDb } from './auth';

export type AuthContextLike = {
  db: AppDb;
  userId: string;
};

type NotFoundBody = Record<string, string>;

function notFound(body: NotFoundBody) {
  return Response.json(body, { status: 404 });
}

export async function requireOwnedTemplate(
  ctx: AuthContextLike,
  templateId: string,
  body: NotFoundBody = { message: 'Template not found' },
) {
  const template = await ctx.db
    .select()
    .from(schema.templates)
    .where(
      and(
        eq(schema.templates.id, templateId),
        eq(schema.templates.userId, ctx.userId),
        eq(schema.templates.isDeleted, false),
      ),
    )
    .get();

  return template ?? notFound(body);
}

export async function requireOwnedWorkout(
  ctx: AuthContextLike,
  workoutId: string,
  body: NotFoundBody = { message: 'Workout not found' },
) {
  const workout = await ctx.db
    .select()
    .from(schema.workouts)
    .where(
      and(
        eq(schema.workouts.id, workoutId),
        eq(schema.workouts.userId, ctx.userId),
        eq(schema.workouts.isDeleted, false),
      ),
    )
    .get();

  return workout ?? notFound(body);
}

export async function requireOwnedWorkoutExercise(
  ctx: AuthContextLike,
  workoutExerciseId: string,
  body: NotFoundBody = { message: 'Workout exercise not found' },
) {
  const workoutExercise = await ctx.db
    .select({
      id: schema.workoutExercises.id,
      workoutId: schema.workoutExercises.workoutId,
      exerciseId: schema.workoutExercises.exerciseId,
      orderIndex: schema.workoutExercises.orderIndex,
      notes: schema.workoutExercises.notes,
      isAmrap: schema.workoutExercises.isAmrap,
      setNumber: schema.workoutExercises.setNumber,
      isDeleted: schema.workoutExercises.isDeleted,
      updatedAt: schema.workoutExercises.updatedAt,
    })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(
      and(
        eq(schema.workoutExercises.id, workoutExerciseId),
        eq(schema.workouts.userId, ctx.userId),
      ),
    )
    .get();

  return workoutExercise ?? notFound(body);
}

export async function requireOwnedWorkoutSet(
  ctx: AuthContextLike,
  setId: string,
  body: NotFoundBody = { message: 'Set not found' },
) {
  const set = await ctx.db
    .select({
      id: schema.workoutSets.id,
      workoutExerciseId: schema.workoutSets.workoutExerciseId,
      setNumber: schema.workoutSets.setNumber,
      weight: schema.workoutSets.weight,
      reps: schema.workoutSets.reps,
      rpe: schema.workoutSets.rpe,
      isComplete: schema.workoutSets.isComplete,
      completedAt: schema.workoutSets.completedAt,
      isDeleted: schema.workoutSets.isDeleted,
      createdAt: schema.workoutSets.createdAt,
      updatedAt: schema.workoutSets.updatedAt,
    })
    .from(schema.workoutSets)
    .innerJoin(
      schema.workoutExercises,
      eq(schema.workoutSets.workoutExerciseId, schema.workoutExercises.id),
    )
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(and(eq(schema.workoutSets.id, setId), eq(schema.workouts.userId, ctx.userId)))
    .get();

  return set ?? notFound(body);
}

export async function requireOwnedProgramCycle(
  ctx: AuthContextLike,
  cycleId: string,
  body: NotFoundBody = { message: 'Program cycle not found' },
) {
  const cycle = await ctx.db
    .select()
    .from(schema.userProgramCycles)
    .where(
      and(
        eq(schema.userProgramCycles.id, cycleId),
        eq(schema.userProgramCycles.userId, ctx.userId),
      ),
    )
    .get();

  return cycle ?? notFound(body);
}

export async function requireOwnedProgramCycleWorkout(
  ctx: AuthContextLike,
  cycleWorkoutId: string,
  body: NotFoundBody = { message: 'Cycle workout not found' },
) {
  const cycleWorkout = await ctx.db
    .select({
      id: schema.programCycleWorkouts.id,
      cycleId: schema.programCycleWorkouts.cycleId,
      templateId: schema.programCycleWorkouts.templateId,
      weekNumber: schema.programCycleWorkouts.weekNumber,
      sessionNumber: schema.programCycleWorkouts.sessionNumber,
      sessionName: schema.programCycleWorkouts.sessionName,
      targetLifts: schema.programCycleWorkouts.targetLifts,
      isComplete: schema.programCycleWorkouts.isComplete,
      workoutId: schema.programCycleWorkouts.workoutId,
      scheduledAt: schema.programCycleWorkouts.scheduledAt,
      createdAt: schema.programCycleWorkouts.createdAt,
      updatedAt: schema.programCycleWorkouts.updatedAt,
    })
    .from(schema.programCycleWorkouts)
    .innerJoin(
      schema.userProgramCycles,
      eq(schema.programCycleWorkouts.cycleId, schema.userProgramCycles.id),
    )
    .where(
      and(
        eq(schema.programCycleWorkouts.id, cycleWorkoutId),
        eq(schema.userProgramCycles.userId, ctx.userId),
      ),
    )
    .get();

  return cycleWorkout ?? notFound(body);
}

export async function requireOwnedNutritionEntry(
  ctx: AuthContextLike,
  entryId: string,
  body: NotFoundBody = { error: 'Nutrition entry not found' },
) {
  const entry = await ctx.db
    .select()
    .from(schema.nutritionEntries)
    .where(
      and(
        eq(schema.nutritionEntries.id, entryId),
        eq(schema.nutritionEntries.userId, ctx.userId),
        eq(schema.nutritionEntries.isDeleted, false),
      ),
    )
    .get();

  return entry ?? notFound(body);
}

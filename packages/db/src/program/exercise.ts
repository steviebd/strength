import { eq, and, sql } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { exercises, generateId } from '../schema';
import type { ExerciseLibraryItem } from '../exercise-library';
import { exerciseLibrary, getExerciseTypeByLibraryId } from '../exercise-library';

export type LiftType = 'squat' | 'bench' | 'deadlift' | 'ohp' | 'row';

export function getExerciseFromLibrary(exerciseName: string): ExerciseLibraryItem | undefined {
  const normalized = exerciseName.toLowerCase().trim();
  return exerciseLibrary.find((e) => e.name.toLowerCase() === normalized);
}

export function inferMuscleGroup(liftType?: LiftType): string {
  if (!liftType) return 'Shoulders';
  switch (liftType) {
    case 'squat':
    case 'deadlift':
    case 'row':
      return 'Back';
    case 'bench':
    case 'ohp':
      return 'Chest';
    default:
      return 'Shoulders';
  }
}

export async function getOrCreateExerciseForUser(
  db: DrizzleD1Database<Record<string, unknown>>,
  userId: string,
  exerciseName: string,
  liftType?: LiftType,
  libraryId?: string,
): Promise<string> {
  if (libraryId) {
    const now = new Date();
    const libraryItem = exerciseLibrary.find((e) => e.id === libraryId);
    const canonicalName = libraryItem?.name ?? exerciseName;
    const canonicalMuscleGroup = libraryItem?.muscleGroup ?? inferMuscleGroup(liftType);
    const canonicalDescription = libraryItem?.description ?? null;

    const existingByLibraryId = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.userId, userId),
          eq(exercises.libraryId, libraryId),
          eq(exercises.isDeleted, false),
        ),
      )
      .get();

    if (existingByLibraryId) {
      await db
        .update(exercises)
        .set({
          muscleGroup: canonicalMuscleGroup,
          description: canonicalDescription,
          exerciseType: getExerciseTypeByLibraryId(libraryId),
          updatedAt: now,
        })
        .where(eq(exercises.id, existingByLibraryId.id))
        .run();
      return existingByLibraryId.id;
    }

    const existingByName = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.userId, userId),
          eq(exercises.isDeleted, false),
          eq(sql`lower(${exercises.name})`, canonicalName.toLowerCase()),
        ),
      )
      .get();

    if (existingByName) {
      return existingByName.id;
    }

    const result = await db
      .insert(exercises)
      .values({
        id: generateId(),
        userId,
        name: canonicalName,
        muscleGroup: canonicalMuscleGroup,
        description: canonicalDescription,
        libraryId,
        exerciseType: getExerciseTypeByLibraryId(libraryId),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: exercises.id })
      .get();

    if (result) {
      return result.id;
    }

    const fallback = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(
        and(
          eq(exercises.userId, userId),
          eq(exercises.isDeleted, false),
          sql`(${exercises.libraryId} = ${libraryId} OR lower(${exercises.name}) = ${canonicalName.toLowerCase()})`,
        ),
      )
      .get();

    if (!fallback) {
      throw new Error('Failed to create or find library exercise');
    }
    return fallback.id;
  }

  const existingByName = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), eq(exercises.name, exerciseName)))
    .get();

  if (existingByName) {
    return existingByName.id;
  }

  const libraryItem = getExerciseFromLibrary(exerciseName);

  if (libraryItem) {
    const now = new Date();
    const result = await db
      .insert(exercises)
      .values({
        id: generateId(),
        userId,
        name: libraryItem.name,
        muscleGroup: libraryItem.muscleGroup,
        description: libraryItem.description,
        libraryId: libraryItem.id,
        exerciseType: getExerciseTypeByLibraryId(libraryItem.id),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [exercises.userId, exercises.libraryId],
        set: {
          name: libraryItem.name,
          muscleGroup: libraryItem.muscleGroup,
          description: libraryItem.description,
          exerciseType: getExerciseTypeByLibraryId(libraryItem.id),
          updatedAt: now,
        },
      })
      .returning({ id: exercises.id })
      .get();
    return result.id;
  }

  const now = new Date();
  const created = await db
    .insert(exercises)
    .values({
      id: generateId(),
      userId,
      name: exerciseName,
      muscleGroup: inferMuscleGroup(liftType),
      description: null,
      libraryId: null,
      exerciseType: 'weighted',
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [exercises.userId, sql`lower(${exercises.name})`],
    })
    .returning({ id: exercises.id })
    .get();

  if (created) {
    return created.id;
  }

  // Fallback: another request created it concurrently
  const fallback = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.userId, userId),
        eq(sql`lower(${exercises.name})`, exerciseName.toLowerCase()),
      ),
    )
    .get();

  if (!fallback) {
    throw new Error('Failed to create or find exercise');
  }
  return fallback.id;
}

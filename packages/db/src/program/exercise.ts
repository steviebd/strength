import { eq, and } from 'drizzle-orm';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { exercises, generateId, type ExerciseLibraryItem } from '../schema';
import { exerciseLibrary } from '../exercise-library';

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
): Promise<string> {
  const existing = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(eq(exercises.userId, userId), eq(exercises.name, exerciseName)))
    .get();

  if (existing) {
    return existing.id;
  }

  const libraryItem = getExerciseFromLibrary(exerciseName);

  if (libraryItem) {
    const existingLibrary = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(and(eq(exercises.userId, userId), eq(exercises.libraryId, libraryItem.id)))
      .get();

    if (existingLibrary) {
      return existingLibrary.id;
    }

    const now = new Date();
    const created = await db
      .insert(exercises)
      .values({
        id: generateId(),
        userId,
        name: libraryItem.name,
        muscleGroup: libraryItem.muscleGroup,
        description: libraryItem.description,
        libraryId: libraryItem.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: exercises.id })
      .get();

    return created.id;
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
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: exercises.id })
    .get();

  return created.id;
}

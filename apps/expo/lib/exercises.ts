import { apiFetch } from '@/lib/api';
import type { ExerciseLibraryItem } from '@strength/db/client';
import { cacheUserExercises, deleteCachedUserExercise } from '@/db/workouts';
import { getCachedUserExercises } from '@/db/training-cache';
import { authClient } from './auth-client';

export interface UserExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  description: string | null;
  libraryId: string | null;
  exerciseType?: string | null;
  isAmrap?: boolean | null;
}

interface CreateExerciseInput {
  name: string;
  muscleGroup: string;
  description?: string | null;
  exerciseType?: string;
  isAmrap?: boolean;
}

export async function listUserExercises(search?: string, signal?: AbortSignal) {
  const query = search?.trim()
    ? `/api/exercises?search=${encodeURIComponent(search.trim())}`
    : '/api/exercises';

  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  try {
    const exercises = await apiFetch<UserExercise[]>(query, { signal });
    if (userId) {
      await cacheUserExercises(userId, exercises);
    }
    return exercises;
  } catch (error) {
    if (userId) {
      const cached = await getCachedUserExercises(userId, search);
      if (cached.length > 0) {
        return cached.map((exercise) => ({
          id: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          description: exercise.description,
          libraryId: exercise.libraryId,
          exerciseType: exercise.exerciseType,
          isAmrap: exercise.isAmrap,
        }));
      }
    }
    throw error;
  }
}

export async function createCustomExercise(input: CreateExerciseInput) {
  const exercise = await apiFetch<UserExercise>('/api/exercises', {
    method: 'POST',
    body: {
      name: input.name.trim(),
      muscleGroup: input.muscleGroup,
      description: input.description?.trim() || null,
      exerciseType: input.exerciseType,
      isAmrap: input.isAmrap,
    },
  });

  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  if (userId) {
    await cacheUserExercises(userId, [exercise]);
  }

  return exercise;
}

export async function deleteCustomExercise(exerciseId: string) {
  await apiFetch<{ success: boolean }>(`/api/exercises/${encodeURIComponent(exerciseId)}`, {
    method: 'DELETE',
  });

  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  if (userId) {
    await deleteCachedUserExercise(userId, exerciseId);
  }
}

export async function ensurePersistedExercise(exercise: ExerciseLibraryItem) {
  const persistedExercise = await apiFetch<UserExercise>('/api/exercises', {
    method: 'POST',
    body: {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      description: exercise.description || null,
      libraryId: exercise.id,
      exerciseType: (exercise as any).exerciseType,
      isAmrap: (exercise as any).isAmrap,
    },
  });

  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  if (userId) {
    await cacheUserExercises(userId, [persistedExercise]);
  }

  return persistedExercise;
}

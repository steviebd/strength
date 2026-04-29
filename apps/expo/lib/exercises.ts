import { apiFetch } from '@/lib/api';
import type { ExerciseLibraryItem } from '@strength/db/client';
import { cacheUserExercises } from '@/db/workouts';
import { getCachedUserExercises } from '@/db/training-cache';
import { authClient } from './auth-client';

export interface UserExercise {
  id: string;
  name: string;
  muscleGroup: string | null;
  description: string | null;
  libraryId: string | null;
}

interface CreateExerciseInput {
  name: string;
  muscleGroup: string;
  description?: string | null;
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
    },
  });

  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  if (userId) {
    await cacheUserExercises(userId, [exercise]);
  }

  return exercise;
}

export async function ensurePersistedExercise(exercise: ExerciseLibraryItem) {
  const persistedExercise = await apiFetch<UserExercise>('/api/exercises', {
    method: 'POST',
    body: {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      description: exercise.description || null,
      libraryId: exercise.id,
    },
  });

  const session = await authClient.getSession();
  const userId = session.data?.user?.id;
  if (userId) {
    await cacheUserExercises(userId, [persistedExercise]);
  }

  return persistedExercise;
}

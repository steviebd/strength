import { apiFetch } from '@/lib/api';
import type { ExerciseLibraryItem } from '@strength/db';

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

  return apiFetch<UserExercise[]>(query, { signal });
}

export async function createCustomExercise(input: CreateExerciseInput) {
  return apiFetch<UserExercise>('/api/exercises', {
    method: 'POST',
    body: {
      name: input.name.trim(),
      muscleGroup: input.muscleGroup,
      description: input.description?.trim() || null,
    },
  });
}

export async function ensurePersistedExercise(exercise: ExerciseLibraryItem) {
  return apiFetch<UserExercise>('/api/exercises', {
    method: 'POST',
    body: {
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      description: exercise.description || null,
      libraryId: exercise.id,
    },
  });
}

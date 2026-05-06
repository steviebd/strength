import { eq, and } from 'drizzle-orm';
import { getLocalDb } from './client';
import { localLastWorkouts } from './local-schema';
import { apiFetch } from '@/lib/api';

export interface LastWorkoutData {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  duration: number | null;
  distance: number | null;
  height: number | null;
  date: string;
}

export async function getLastWorkout(
  userId: string,
  exerciseId: string,
): Promise<LastWorkoutData | null> {
  const db = getLocalDb();
  if (!db) return null;

  const row = db
    .select()
    .from(localLastWorkouts)
    .where(and(eq(localLastWorkouts.userId, userId), eq(localLastWorkouts.exerciseId, exerciseId)))
    .get();

  if (row) {
    return {
      weight: row.weight ?? null,
      reps: row.reps ?? null,
      rpe: row.rpe ?? null,
      duration: row.duration ?? null,
      distance: row.distance ?? null,
      height: row.height ?? null,
      date: row.date,
    };
  }

  // Cache miss: fetch from server and cache result
  try {
    const snapshot = await apiFetch<{
      exerciseId: string;
      workoutDate: string | null;
      sets: Array<{ weight: number | null; reps: number | null; rpe: number | null }>;
    } | null>(`/api/workouts/last/${encodeURIComponent(exerciseId)}`);

    if (snapshot && snapshot.sets.length > 0) {
      const lastSet = snapshot.sets[snapshot.sets.length - 1];
      const data: LastWorkoutData = {
        weight: lastSet.weight ?? null,
        reps: lastSet.reps ?? null,
        rpe: lastSet.rpe ?? null,
        duration: (lastSet as any).duration ?? null,
        distance: (lastSet as any).distance ?? null,
        height: (lastSet as any).height ?? null,
        date: snapshot.workoutDate ?? new Date().toISOString(),
      };
      await setLastWorkout(userId, exerciseId, data);
      return data;
    }
  } catch {
    // Server fallback is best-effort
  }

  return null;
}

export async function setLastWorkout(
  userId: string,
  exerciseId: string,
  data: LastWorkoutData,
): Promise<void> {
  const db = getLocalDb();
  if (!db) return;

  const now = new Date();
  db.insert(localLastWorkouts)
    .values({
      userId,
      exerciseId,
      weight: data.weight ?? null,
      reps: data.reps ?? null,
      rpe: data.rpe ?? null,
      duration: data.duration ?? null,
      distance: data.distance ?? null,
      height: data.height ?? null,
      date: data.date,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [localLastWorkouts.userId, localLastWorkouts.exerciseId],
      set: {
        weight: data.weight ?? null,
        reps: data.reps ?? null,
        rpe: data.rpe ?? null,
        duration: data.duration ?? null,
        distance: data.distance ?? null,
        height: data.height ?? null,
        date: data.date,
        updatedAt: now,
      },
    })
    .run();
}

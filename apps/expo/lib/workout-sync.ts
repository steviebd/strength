import { ApiError, apiFetch } from '@/lib/api';
import { removePendingWorkout } from '@/lib/storage';
import {
  hydrateOfflineTrainingSnapshot,
  markLocalProgramAdvance,
  type OfflineTrainingSnapshot,
} from '@/db/training-cache';
import {
  buildWorkoutCompletionPayload,
  markWorkoutConflict,
  markWorkoutFailed,
  markWorkoutSynced,
  markWorkoutSyncing,
  upsertServerWorkoutSnapshot,
} from '@/db/workouts';
import {
  deleteSyncItem,
  getRunnableSyncItems,
  markSyncItemStatus,
  resetWorkoutSyncItems,
} from '@/db/sync-queue';
import type { Workout } from '@/context/WorkoutSessionContext';

let isSyncRunning = false;

type SyncCompleteResponse = {
  workout: Workout;
  exercises: any[];
  sets: any[];
  programAdvance?: {
    programCycleId: string;
    completedCycleWorkoutId?: string;
    currentWeek?: number | null;
    currentSession?: number | null;
    status?: string | null;
  };
};

function normalizeServerWorkout(response: SyncCompleteResponse): Workout {
  const setsByExercise = new Map<string, any[]>();
  for (const set of response.sets ?? []) {
    const current = setsByExercise.get(set.workoutExerciseId) ?? [];
    current.push(set);
    setsByExercise.set(set.workoutExerciseId, current);
  }

  return {
    ...response.workout,
    exercises: (response.exercises ?? []).map((exercise) => ({
      ...exercise,
      libraryId: exercise.libraryId ?? null,
      sets: setsByExercise.get(exercise.id) ?? [],
    })),
  };
}

export async function runWorkoutSync(userId: string) {
  if (isSyncRunning) return;
  isSyncRunning = true;

  try {
    const items = await getRunnableSyncItems(userId);
    for (const item of items) {
      if (item.operation !== 'complete_workout' || item.entityType !== 'workout') {
        continue;
      }

      await markSyncItemStatus(item.id, 'syncing');
      await markWorkoutSyncing(item.entityId);

      try {
        const payload =
          (await buildWorkoutCompletionPayload(item.entityId)) ?? JSON.parse(item.payloadJson);
        const response = await apiFetch<SyncCompleteResponse>(
          `/api/workouts/${item.entityId}/sync-complete`,
          {
            method: 'POST',
            body: payload,
          },
        );
        const serverWorkout = normalizeServerWorkout(response);
        await upsertServerWorkoutSnapshot(userId, serverWorkout);
        if (response.programAdvance) {
          await markLocalProgramAdvance({
            ...response.programAdvance,
            workoutId: item.entityId,
          });
        }
        await markWorkoutSynced(item.entityId);
        await markSyncItemStatus(item.id, 'done');
        await deleteSyncItem(item.id);
        await removePendingWorkout(item.entityId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to sync workout';
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          await markWorkoutConflict(item.entityId, message);
          await markSyncItemStatus(item.id, 'conflict', { error: message });
        } else {
          await markWorkoutFailed(item.entityId, message);
          await markSyncItemStatus(item.id, 'failed', { error: message });
        }
      }
    }
  } finally {
    isSyncRunning = false;
  }
}

export async function retryWorkoutSync(userId: string, workoutId: string) {
  await resetWorkoutSyncItems(workoutId);
  await runWorkoutSync(userId);
}

let lastTrainingHydrationAt = 0;

export async function hydrateTrainingCache(userId: string, options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastTrainingHydrationAt < 60_000) {
    return;
  }
  const snapshot = await apiFetch<OfflineTrainingSnapshot>(
    '/api/training/offline-snapshot?recentWorkoutLimit=50',
  );
  await hydrateOfflineTrainingSnapshot(userId, snapshot);
  lastTrainingHydrationAt = now;
}

export async function runTrainingSync(userId: string, options?: { forceHydrate?: boolean }) {
  await runWorkoutSync(userId);
  try {
    await hydrateTrainingCache(userId, { force: options?.forceHydrate });
  } catch {
    // Offline is expected; keep serving local cache.
  }
}

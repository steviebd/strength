import { ApiError, apiFetch } from '@/lib/api';
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
        await markWorkoutSynced(item.entityId);
        await markSyncItemStatus(item.id, 'done');
        await deleteSyncItem(item.id);
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

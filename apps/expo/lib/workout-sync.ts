import { and, eq } from 'drizzle-orm';
import { ApiError, apiFetch } from '@/lib/api';
import { removePendingWorkout } from '@/lib/storage';
import { getLocalDb } from '@/db/client';
import { cleanupStaleLocalData } from '@/db/local-cleanup';
import {
  localChatMessageQueue,
  localTrainingCacheMeta,
  type LocalSyncQueueItem,
} from '@/db/local-schema';
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateChatMessageStatus(
  id: string,
  status: 'pending' | 'sending' | 'sent' | 'failed',
  assistantContentOrError?: string,
) {
  const db = getLocalDb();
  if (!db) return;
  const updates: any = { status, updatedAt: new Date() };
  if (status === 'sent') {
    updates.assistantContent = assistantContentOrError;
  } else if (status === 'failed') {
    updates.lastError = assistantContentOrError;
    const existing = db
      .select({ attemptCount: localChatMessageQueue.attemptCount })
      .from(localChatMessageQueue)
      .where(eq(localChatMessageQueue.id, id))
      .get();
    updates.attemptCount = (existing?.attemptCount ?? 0) + 1;
  }
  db.update(localChatMessageQueue).set(updates).where(eq(localChatMessageQueue.id, id)).run();
}

function getSyncEndpoint(item: LocalSyncQueueItem): { url: string; method: string } {
  switch (item.operation) {
    case 'delete_workout':
      return { url: `/api/workouts/${item.entityId}`, method: 'DELETE' };
    case 'save_meal':
      return { url: `/api/nutrition/meals`, method: 'POST' };
    case 'delete_meal':
      return { url: `/api/nutrition/meals/${item.entityId}`, method: 'DELETE' };
    case 'save_template':
      return { url: `/api/templates/${item.entityId}`, method: 'PUT' };
    case 'create_template':
      return { url: `/api/templates`, method: 'POST' };
    case 'delete_template':
      return { url: `/api/templates/${item.entityId}`, method: 'DELETE' };
    case 'update_body_stats':
      return { url: `/api/nutrition/body-stats`, method: 'POST' };
    case 'start_program':
      return { url: `/api/programs`, method: 'POST' };
    case 'delete_program':
      return { url: `/api/programs/cycles/${item.entityId}`, method: 'DELETE' };
    case 'update_program_1rms':
      return { url: `/api/programs/cycles/${item.entityId}`, method: 'PUT' };
    case 'reschedule_workout':
      return {
        url: `/api/programs/cycle-workouts/${item.entityId}/schedule`,
        method: 'PUT',
      };
    case 'save_training_context':
      return { url: '/api/nutrition/training-context', method: 'POST' };
    case 'send_chat_message':
      return { url: '/api/nutrition/chat', method: 'POST' };
    default:
      throw new Error(`Unsupported sync operation: ${item.operation}`);
  }
}

async function handleGenericSync(item: LocalSyncQueueItem) {
  const { url, method } = getSyncEndpoint(item);
  const body = method === 'DELETE' ? undefined : JSON.parse(item.payloadJson);
  await apiFetch(url, { method, body });
}

export async function runSyncQueue(userId: string) {
  if (isSyncRunning) return;
  isSyncRunning = true;

  try {
    const items = await getRunnableSyncItems(userId);
    for (const item of items) {
      if (item.operation === 'complete_workout' && item.entityType === 'workout') {
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
      } else if (item.operation === 'send_chat_message') {
        if (item.attemptCount >= 5) {
          await markSyncItemStatus(item.id, 'conflict', {
            error: 'Chat message failed after 5 attempts',
          });
          await updateChatMessageStatus(item.entityId, 'failed', 'Failed after maximum retries');
          continue;
        }

        await markSyncItemStatus(item.id, 'syncing');
        await updateChatMessageStatus(item.entityId, 'sending');

        const payload = JSON.parse(item.payloadJson);
        try {
          const chatResponse = await apiFetch<{ jobId: string }>('/api/nutrition/chat', {
            method: 'POST',
            body: {
              messages: payload.messages,
              date: payload.date,
              timezone: payload.timezone,
              hasImage: payload.hasImage,
              imageBase64: payload.imageBase64,
              syncOperationId: item.id,
            },
          });

          const jobStartedAt = Date.now();
          const CHAT_JOB_POLL_INTERVAL_MS = 1500;
          const CHAT_JOB_TIMEOUT_MS = 3 * 60 * 1000;
          let assistantContent = '';
          while (Date.now() - jobStartedAt < CHAT_JOB_TIMEOUT_MS) {
            const job = await apiFetch<{ status: string; content?: string; error?: string }>(
              `/api/nutrition/chat/jobs/${chatResponse.jobId}`,
            );
            if (job.status === 'completed') {
              assistantContent = job.content ?? '';
              break;
            }
            if (job.status === 'failed') {
              throw new Error(job.error ?? 'Chat job failed');
            }
            await delay(CHAT_JOB_POLL_INTERVAL_MS);
          }
          if (!assistantContent.trim()) {
            throw new Error('Chat job timed out');
          }

          await markSyncItemStatus(item.id, 'done');
          await deleteSyncItem(item.id);
          await updateChatMessageStatus(item.entityId, 'sent', assistantContent);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await markSyncItemStatus(item.id, 'failed', { error: message });
          await updateChatMessageStatus(item.entityId, 'failed', message);
        }
      } else {
        await markSyncItemStatus(item.id, 'syncing');
        try {
          await handleGenericSync(item);
          await markSyncItemStatus(item.id, 'done');
          await deleteSyncItem(item.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sync failed';
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            await markSyncItemStatus(item.id, 'conflict', { error: message });
          } else {
            await markSyncItemStatus(item.id, 'failed', { error: message });
          }
        }
      }
    }
  } finally {
    isSyncRunning = false;
  }
}

/**
 * @deprecated Use `runSyncQueue` instead.
 */
export async function runWorkoutSync(userId: string) {
  return runSyncQueue(userId);
}

export async function retryWorkoutSync(userId: string, workoutId: string) {
  await resetWorkoutSyncItems(workoutId);
  await runSyncQueue(userId);
}

let lastTrainingHydrationAt = 0;

export async function hydrateTrainingCache(userId: string, options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastTrainingHydrationAt < 10_000) {
    return;
  }

  const db = getLocalDb();
  if (db) {
    const row = db
      .select({ hydratedAt: localTrainingCacheMeta.hydratedAt })
      .from(localTrainingCacheMeta)
      .where(
        and(
          eq(localTrainingCacheMeta.userId, userId),
          eq(localTrainingCacheMeta.cacheKey, 'offline-snapshot'),
        ),
      )
      .get();
    if (row && now - row.hydratedAt.getTime() < 10_000 && !options?.force) {
      lastTrainingHydrationAt = row.hydratedAt.getTime();
      return;
    }
  }

  const snapshot = await apiFetch<OfflineTrainingSnapshot>(
    '/api/training/offline-snapshot?recentWorkoutLimit=50',
  );
  await hydrateOfflineTrainingSnapshot(userId, snapshot);
  lastTrainingHydrationAt = now;
}

export async function runTrainingSync(userId: string, options?: { forceHydrate?: boolean }) {
  await runSyncQueue(userId);
  try {
    await hydrateTrainingCache(userId, { force: options?.forceHydrate });
  } catch {
    // Offline is expected; keep serving local cache.
  }
  try {
    await cleanupStaleLocalData(userId);
  } catch {
    // Cleanup failures should not break the sync/hydration flow.
  }
}

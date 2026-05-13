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
  deleteLocalCustomProgram,
  hydrateOfflineTrainingSnapshot,
  markLocalProgramAdvance,
  type OfflineTrainingSnapshot,
} from '@/db/training-cache';
import { hydrateBodyweightHistory, type BodyweightHistoryEntry } from '@/db/body-stats';
import { hydrateNutritionCache } from '@/db/nutrition-cache';
import { getTodayLocalDate } from '@/lib/timezone';
import {
  buildWorkoutCompletionPayload,
  markWorkoutConflict,
  markWorkoutFailed,
  markWorkoutSynced,
  markWorkoutSyncing,
  upsertLocalTemplateSnapshot,
  upsertServerWorkoutSnapshot,
} from '@/db/workouts';
import { upsertLocalCustomProgramSnapshot } from '@/db/training-cache';
import {
  deleteSyncItem,
  getRecoverableWorkoutSyncItems,
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
    totalSessionsCompleted?: number | null;
    totalSessionsPlanned?: number | null;
    status?: string | null;
    isComplete?: boolean | null;
    completedAt?: string | number | Date | null;
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
    case 'create_custom_program':
    case 'save_custom_program':
      return { url: '/api/custom-programs', method: 'POST' };
    case 'delete_custom_program':
      return { url: `/api/custom-programs/${item.entityId}`, method: 'DELETE' };
    case 'start_custom_program':
      return { url: `/api/custom-programs/${item.entityId}/start`, method: 'POST' };
    default:
      throw new Error(`Unsupported sync operation: ${item.operation}`);
  }
}

async function handleGenericSync(item: LocalSyncQueueItem) {
  const { url, method } = getSyncEndpoint(item);
  const body = method === 'DELETE' ? undefined : JSON.parse(item.payloadJson);
  await apiFetch(url, { method, body });
}

function templateBodyFromPayload(payload: any) {
  return {
    ...(typeof payload.id === 'string' ? { id: payload.id } : {}),
    name: payload.name,
    description: payload.description,
    notes: payload.notes,
    defaultWeightIncrement: payload.defaultWeightIncrement,
    defaultBodyweightIncrement: payload.defaultBodyweightIncrement,
    defaultCardioIncrement: payload.defaultCardioIncrement,
    defaultTimedIncrement: payload.defaultTimedIncrement,
    defaultPlyoIncrement: payload.defaultPlyoIncrement,
  };
}

async function syncTemplateExercises(templateId: string, exercises: any[]) {
  const existingExercises = await apiFetch<Array<{ id: string }>>(
    `/api/templates/${templateId}/exercises`,
  );
  const existingIds = new Set(existingExercises.map((exercise) => exercise.id));
  const selectedIds = new Set(exercises.map((exercise) => exercise.id).filter(Boolean));

  await Promise.all(
    existingExercises
      .filter((existing) => !selectedIds.has(existing.id))
      .map((existing) =>
        apiFetch(`/api/templates/${templateId}/exercise-rows/${existing.id}`, {
          method: 'DELETE',
        }),
      ),
  );

  await Promise.all(
    exercises.map((exercise, index) => {
      const body = { ...exercise, orderIndex: exercise.orderIndex ?? index };
      return existingIds.has(exercise.id)
        ? apiFetch(`/api/templates/${templateId}/exercise-rows/${exercise.id}`, {
            method: 'PUT',
            body,
          })
        : apiFetch(`/api/templates/${templateId}/exercises`, {
            method: 'POST',
            body,
          });
    }),
  );
}

async function handleTemplateSync(item: LocalSyncQueueItem) {
  const payload = JSON.parse(item.payloadJson);
  const templateId = payload.id ?? item.entityId;
  const method = item.operation === 'create_template' ? 'POST' : 'PUT';
  const url =
    item.operation === 'create_template' ? '/api/templates' : `/api/templates/${item.entityId}`;
  const savedTemplate = await apiFetch<any>(url, {
    method,
    body: templateBodyFromPayload({ ...payload, id: templateId }),
  });

  if (Array.isArray(payload.exercises)) {
    await syncTemplateExercises(savedTemplate.id ?? templateId, payload.exercises);
  }

  await upsertLocalTemplateSnapshot(
    item.userId,
    {
      ...payload,
      ...savedTemplate,
      id: savedTemplate.id ?? templateId,
      exercises: Array.isArray(payload.exercises) ? payload.exercises : undefined,
    },
    {
      createdLocally: false,
      replaceExercises: Array.isArray(payload.exercises),
    },
  );
}

async function handleCustomProgramSync(item: LocalSyncQueueItem) {
  const payload = JSON.parse(item.payloadJson);
  const programId = payload.id ?? item.entityId;

  // 1. Save program metadata
  const savedProgram = await apiFetch<any>('/api/custom-programs', {
    method: 'POST',
    body: {
      id: programId,
      name: payload.name,
      description: payload.description,
      notes: payload.notes,
      daysPerWeek: payload.daysPerWeek,
      weeks: payload.weeks,
    },
  });

  const savedProgramId = savedProgram.id ?? programId;

  // 2. Save workouts + exercises
  if (Array.isArray(payload.workouts)) {
    for (const workout of payload.workouts) {
      const savedWorkout = await apiFetch<any>(`/api/custom-programs/${savedProgramId}/workouts`, {
        method: 'POST',
        body: {
          id: workout.id,
          customProgramId: savedProgramId,
          dayIndex: workout.dayIndex,
          name: workout.name,
          orderIndex: workout.orderIndex,
        },
      });
      const savedWorkoutId = savedWorkout.id ?? workout.id;

      if (Array.isArray(workout.exercises)) {
        for (let ei = 0; ei < workout.exercises.length; ei++) {
          const ex = workout.exercises[ei];
          await apiFetch<any>(`/api/custom-programs/workouts/${savedWorkoutId}/exercises`, {
            method: 'POST',
            body: {
              id: ex.id,
              exerciseId: ex.exerciseId,
              orderIndex: ei,
              exerciseType: ex.exerciseType ?? 'weights',
              sets: ex.sets,
              reps: ex.reps,
              repsRaw: ex.repsRaw,
              weightMode: ex.weightMode,
              fixedWeight: ex.fixedWeight,
              percentageOfLift: ex.percentageOfLift,
              percentageLift: ex.percentageLift,
              addedWeight: ex.addedWeight,
              targetDuration: ex.targetDuration,
              targetDistance: ex.targetDistance,
              targetHeight: ex.targetHeight,
              isAmrap: ex.isAmrap,
              isAccessory: ex.isAccessory,
              isRequired: ex.isRequired,
              setNumber: ex.setNumber,
              progressionAmount: ex.progressionAmount,
              progressionInterval: ex.progressionInterval,
            },
          });
        }
      }
    }
  }

  // 3. Update local cache
  await upsertLocalCustomProgramSnapshot(
    item.userId,
    {
      ...payload,
      id: savedProgramId,
      workouts: Array.isArray(payload.workouts) ? payload.workouts : undefined,
    },
    { createdLocally: false },
  );
}

async function reconcileCompletedWorkoutSyncs(userId: string) {
  const items = await getRecoverableWorkoutSyncItems(userId);
  for (const item of items) {
    try {
      const serverWorkout = await apiFetch<Workout>(`/api/workouts/${item.entityId}`);
      if (!serverWorkout?.completedAt) continue;

      await upsertServerWorkoutSnapshot(userId, serverWorkout);
      await markWorkoutSynced(item.entityId);
      await markSyncItemStatus(item.id, 'done');
      await deleteSyncItem(item.id);
      await removePendingWorkout(item.entityId);
    } catch {
      // Normal sync below will handle runnable pending/failed items.
    }
  }
}

export async function runSyncQueue(userId: string) {
  if (isSyncRunning) return;
  isSyncRunning = true;

  try {
    await reconcileCompletedWorkoutSyncs(userId);
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
          if (
            item.entityType === 'template' &&
            (item.operation === 'create_template' || item.operation === 'save_template')
          ) {
            await handleTemplateSync(item);
          } else if (
            item.entityType === 'custom_program' &&
            (item.operation === 'create_custom_program' || item.operation === 'save_custom_program')
          ) {
            await handleCustomProgramSync(item);
          } else {
            await handleGenericSync(item);
            if (
              item.entityType === 'custom_program' &&
              item.operation === 'delete_custom_program'
            ) {
              await deleteLocalCustomProgram(item.entityId);
            }
          }
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

let lastHydrationAt = 0;
let isDataSyncRunning = false;

export async function hydrateLocalCache(userId: string, options?: { force?: boolean }) {
  const now = Date.now();
  if (!options?.force && now - lastHydrationAt < 10_000) {
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
      lastHydrationAt = row.hydratedAt.getTime();
      return;
    }
  }

  const snapshot = await apiFetch<OfflineTrainingSnapshot>('/api/training/offline-snapshot');
  await hydrateOfflineTrainingSnapshot(userId, snapshot);
  lastHydrationAt = now;
}

export async function syncOfflineQueueAndCache(
  userId: string,
  options?: { forceHydrate?: boolean },
) {
  if (isDataSyncRunning) return;
  isDataSyncRunning = true;
  try {
    await runSyncQueue(userId);
    try {
      await hydrateLocalCache(userId, { force: options?.forceHydrate });
    } catch {
      // Offline is expected; keep serving local cache.
    }
    try {
      const history = await apiFetch<BodyweightHistoryEntry[]>('/api/nutrition/bodyweight-history');
      await hydrateBodyweightHistory(userId, history);
    } catch {
      // Offline is expected; keep serving local cache.
    }
    try {
      const today = getTodayLocalDate();
      await hydrateNutritionCache(userId, today, 'UTC');
    } catch {
      // Offline is expected; keep serving local cache.
    }
    try {
      await cleanupStaleLocalData(userId);
    } catch {
      // Cleanup failures should not break the sync/hydration flow.
    }
  } finally {
    isDataSyncRunning = false;
  }
}

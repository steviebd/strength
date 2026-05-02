import { and, eq, inArray, lte, or } from 'drizzle-orm';
import { generateId } from '@strength/db/client';
import { getLocalDb } from './client';
import { localSyncQueue, type LocalSyncQueueItem } from './local-schema';

export type SyncQueueStatus = 'pending' | 'syncing' | 'failed' | 'conflict' | 'done';

const RETRY_DELAYS_MS = [15_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function nextAvailableAt(attemptCount: number) {
  const delay = RETRY_DELAYS_MS[Math.min(attemptCount, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
  return new Date(Date.now() + delay);
}

export async function enqueueWorkoutCompletion(
  userId: string,
  workoutId: string,
  payload: unknown,
) {
  const db = getLocalDb();
  if (!db) return null;

  const now = new Date();
  const id = generateId();
  db.insert(localSyncQueue)
    .values({
      id,
      userId,
      entityType: 'workout',
      entityId: workoutId,
      operation: 'complete_workout',
      payloadJson: JSON.stringify(payload),
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      availableAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

export async function getRunnableSyncItems(
  userId: string,
  limit = 5,
): Promise<LocalSyncQueueItem[]> {
  const db = getLocalDb();
  if (!db) return [];

  return db
    .select()
    .from(localSyncQueue)
    .where(
      and(
        eq(localSyncQueue.userId, userId),
        or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'failed')),
        lte(localSyncQueue.availableAt, new Date()),
      ),
    )
    .limit(limit)
    .all();
}

export async function markSyncItemStatus(
  id: string,
  status: SyncQueueStatus,
  options?: { error?: string | null },
) {
  const db = getLocalDb();
  if (!db) return;

  const current = db.select().from(localSyncQueue).where(eq(localSyncQueue.id, id)).get();
  if (!current) return;

  const now = new Date();
  const attemptCount = status === 'failed' ? current.attemptCount + 1 : current.attemptCount;
  db.update(localSyncQueue)
    .set({
      status,
      attemptCount,
      lastError: options?.error ?? null,
      availableAt: status === 'failed' ? nextAvailableAt(attemptCount) : now,
      updatedAt: now,
    })
    .where(eq(localSyncQueue.id, id))
    .run();
}

export async function resetWorkoutSyncItems(workoutId: string) {
  const db = getLocalDb();
  if (!db) return;
  const now = new Date();
  db.update(localSyncQueue)
    .set({ status: 'pending', availableAt: now, updatedAt: now, lastError: null })
    .where(
      and(
        eq(localSyncQueue.entityId, workoutId),
        inArray(localSyncQueue.status, ['failed', 'conflict']),
      ),
    )
    .run();
}

export async function deleteSyncItem(id: string) {
  const db = getLocalDb();
  if (!db) return;
  db.delete(localSyncQueue).where(eq(localSyncQueue.id, id)).run();
}

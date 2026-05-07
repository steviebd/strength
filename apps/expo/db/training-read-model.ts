import { and, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { WORKOUT_TYPE_ONE_RM_TEST } from '@strength/db/client';
import { getLocalDb } from './client';
import {
  localProgramCycles,
  localSyncQueue,
  localWorkoutExercises,
  localWorkouts,
  localWorkoutSets,
} from './local-schema';

export type LatestOneRMs = {
  squat1rm: number | null;
  bench1rm: number | null;
  deadlift1rm: number | null;
  ohp1rm: number | null;
};

export type PendingTrainingWriteScope =
  | 'body_stats'
  | 'chat'
  | 'meal'
  | 'nutrition'
  | 'program'
  | 'program_cycle'
  | 'template'
  | 'workout'
  | 'history'
  | 'one_rms';

const ACTIVE_SYNC_STATUSES = ['pending', 'syncing', 'failed', 'conflict'] as const;

const SCOPE_OPERATIONS: Record<PendingTrainingWriteScope, string[]> = {
  body_stats: ['update_body_stats'],
  chat: ['send_chat_message'],
  meal: ['save_meal', 'delete_meal'],
  nutrition: ['save_meal', 'delete_meal', 'update_body_stats', 'save_training_context'],
  program: ['start_program', 'delete_program', 'reschedule_workout'],
  program_cycle: ['update_program_1rms'],
  template: ['create_template', 'save_template', 'delete_template'],
  workout: ['complete_workout', 'delete_workout'],
  history: ['complete_workout', 'delete_workout'],
  one_rms: ['complete_workout', 'update_program_1rms', 'start_program'],
};

function compact<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => item != null);
}

function normalizeOneRMs(input: Partial<LatestOneRMs> | null | undefined): LatestOneRMs | null {
  if (!input) return null;
  const result = {
    squat1rm: input.squat1rm ?? null,
    bench1rm: input.bench1rm ?? null,
    deadlift1rm: input.deadlift1rm ?? null,
    ohp1rm: input.ohp1rm ?? null,
  };
  return Object.values(result).some((value) => (value ?? 0) > 0) ? result : null;
}

function oneRMsEqual(a: LatestOneRMs | null | undefined, b: LatestOneRMs | null | undefined) {
  const left = normalizeOneRMs(a);
  const right = normalizeOneRMs(b);
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.squat1rm === right.squat1rm &&
    left.bench1rm === right.bench1rm &&
    left.deadlift1rm === right.deadlift1rm &&
    left.ohp1rm === right.ohp1rm
  );
}

export async function hasPendingTrainingWrites(
  userId: string,
  scopes: PendingTrainingWriteScope[],
): Promise<boolean> {
  const db = getLocalDb();
  if (!db) return false;

  const operations = Array.from(new Set(scopes.flatMap((scope) => SCOPE_OPERATIONS[scope] ?? [])));
  if (operations.length === 0) return false;

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(localSyncQueue)
    .where(
      and(
        eq(localSyncQueue.userId, userId),
        inArray(localSyncQueue.operation, operations),
        inArray(localSyncQueue.status, ACTIVE_SYNC_STATUSES),
      ),
    )
    .get();
  return (result?.count ?? 0) > 0;
}

export function getPendingSyncedEntityIds(userId: string): Set<string> {
  const db = getLocalDb();
  if (!db) return new Set();
  const rows = db
    .select({ entityId: localSyncQueue.entityId })
    .from(localSyncQueue)
    .where(
      and(eq(localSyncQueue.userId, userId), inArray(localSyncQueue.status, ACTIVE_SYNC_STATUSES)),
    )
    .all();
  return new Set(rows.map((row) => row.entityId));
}

export function getLocallyDirtyProgramCycleIds(userId: string): Set<string> {
  const db = getLocalDb();
  if (!db) return new Set();

  const directRows = db
    .select({
      entityType: localSyncQueue.entityType,
      entityId: localSyncQueue.entityId,
    })
    .from(localSyncQueue)
    .where(
      and(
        eq(localSyncQueue.userId, userId),
        inArray(localSyncQueue.status, ACTIVE_SYNC_STATUSES),
        inArray(localSyncQueue.operation, [
          'start_program',
          'delete_program',
          'update_program_1rms',
        ]),
      ),
    )
    .all();

  const ids = new Set(
    directRows
      .filter((row) => row.entityType === 'program' || row.entityType === 'program_cycle')
      .map((row) => row.entityId),
  );

  const workoutRows = db
    .select({ programCycleId: localWorkouts.programCycleId })
    .from(localSyncQueue)
    .innerJoin(localWorkouts, eq(localSyncQueue.entityId, localWorkouts.id))
    .where(
      and(
        eq(localSyncQueue.userId, userId),
        eq(localSyncQueue.operation, 'complete_workout'),
        inArray(localSyncQueue.status, ACTIVE_SYNC_STATUSES),
        isNotNull(localWorkouts.programCycleId),
      ),
    )
    .all();
  for (const row of workoutRows) {
    if (row.programCycleId) ids.add(row.programCycleId);
  }

  return ids;
}

export async function getLatestOneRMsFromLocalWorkouts(
  userId: string,
): Promise<LatestOneRMs | null> {
  const db = getLocalDb();
  if (!db) return null;

  const workout = db
    .select({ id: localWorkouts.id })
    .from(localWorkouts)
    .where(
      and(
        eq(localWorkouts.userId, userId),
        eq(localWorkouts.workoutType, WORKOUT_TYPE_ONE_RM_TEST),
        eq(localWorkouts.isDeleted, false),
        isNotNull(localWorkouts.completedAt),
      ),
    )
    .orderBy(desc(localWorkouts.completedAt), desc(localWorkouts.startedAt))
    .limit(1)
    .get();
  if (!workout) return null;

  const rows = db
    .select({
      exerciseName: localWorkoutExercises.name,
      weight: localWorkoutSets.weight,
    })
    .from(localWorkoutExercises)
    .innerJoin(localWorkoutSets, eq(localWorkoutExercises.id, localWorkoutSets.workoutExerciseId))
    .where(
      and(
        eq(localWorkoutExercises.workoutId, workout.id),
        eq(localWorkoutExercises.isDeleted, false),
        eq(localWorkoutSets.isDeleted, false),
        eq(localWorkoutSets.isComplete, true),
      ),
    )
    .all();

  const oneRMs: LatestOneRMs = {
    squat1rm: null,
    bench1rm: null,
    deadlift1rm: null,
    ohp1rm: null,
  };
  const nameToKey: Record<string, keyof LatestOneRMs> = {
    squat: 'squat1rm',
    'bench press': 'bench1rm',
    deadlift: 'deadlift1rm',
    'overhead press': 'ohp1rm',
  };
  for (const row of rows) {
    const key = nameToKey[row.exerciseName.trim().toLowerCase()];
    if (!key || row.weight == null || row.weight <= 0) continue;
    oneRMs[key] = Math.max(oneRMs[key] ?? 0, row.weight);
  }
  return normalizeOneRMs(oneRMs);
}

export async function getLatestOneRMsFromLocalCycles(userId: string): Promise<LatestOneRMs | null> {
  const db = getLocalDb();
  if (!db) return null;
  const cycle = db
    .select({
      squat1rm: localProgramCycles.squat1rm,
      bench1rm: localProgramCycles.bench1rm,
      deadlift1rm: localProgramCycles.deadlift1rm,
      ohp1rm: localProgramCycles.ohp1rm,
    })
    .from(localProgramCycles)
    .where(
      and(
        eq(localProgramCycles.userId, userId),
        or(
          sql`${localProgramCycles.squat1rm} > 0`,
          sql`${localProgramCycles.bench1rm} > 0`,
          sql`${localProgramCycles.deadlift1rm} > 0`,
          sql`${localProgramCycles.ohp1rm} > 0`,
        ),
      ),
    )
    .orderBy(desc(localProgramCycles.startedAt), desc(localProgramCycles.updatedAt))
    .limit(1)
    .get();
  return normalizeOneRMs(cycle);
}

export async function getFreshLatestOneRMs(
  userId: string,
  serverOrCached?: LatestOneRMs | null,
): Promise<LatestOneRMs | null> {
  const localWorkoutOneRMs = await getLatestOneRMsFromLocalWorkouts(userId);
  if (localWorkoutOneRMs) return localWorkoutOneRMs;

  const localCycleOneRMs = await getLatestOneRMsFromLocalCycles(userId);
  if (localCycleOneRMs) return localCycleOneRMs;

  return normalizeOneRMs(serverOrCached);
}

export async function shouldUseLocalLatestOneRMs(
  userId: string,
  serverOrCached?: LatestOneRMs | null,
): Promise<boolean> {
  if (await hasPendingTrainingWrites(userId, ['one_rms'])) return true;
  const fresh = await getFreshLatestOneRMs(userId, serverOrCached);
  return !oneRMsEqual(fresh, serverOrCached);
}

export function hasPendingEntity(
  pendingEntityIds: Set<string>,
  ...entityIds: Array<string | null | undefined>
) {
  return compact(entityIds).some((entityId) => pendingEntityIds.has(entityId));
}

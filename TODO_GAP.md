# Offline Implementation Plan — TODO_GAP

## Current State Assessment

### What Works Well

| Pattern | Coverage |
|---------|----------|
| `useOfflineQuery` — cache-first, background-refresh hook | Templates, Programs, Schedule, Home, Nutrition |
| `tryOnlineOrEnqueue` — standard offline queueing wrapper | 8 mutations |
| `sync-queue.ts` — exponential backoff retry (15s → 1h) | All enqueued operations |
| `useNetworkStatus` — expo-network listener + TanStack onlineManager | Global |
| `OfflineBanner` — offline indicator + pending count badge | Global |
| `runWorkoutSync` — full workout completion flow with conflict handling | Workouts |
| `deleteMealMutation` — proper `onMutate` optimistic UI + `OfflineError` handling in `onError` | Nutrition |

### DRY Gaps

1. **`onEnqueue` callbacks are ad-hoc and missing in half the mutations.**
   - Templates write to `localTemplates` table inside inline `onEnqueue` closures. Works but is copy-pasted across create/update/delete.
   - Programs (`start_cycle_workout`, `reschedule_workout`) have **no `onEnqueue`** — no local state update when offline.
   - Nutrition (`save_meal`, `training_context`) have **no `onEnqueue`** — no local state update when offline.

2. **Optimistic UI patterns vary per mutation.**
   - `deleteMealMutation` uses `onMutate` → `onError` (swallows `OfflineError`) → `onSuccess`. Correct.
   - `saveMealMutation` only calls `invalidateDailySummary` in `onMutate` (clears cache) — no optimistic insert. Meal visually disappears offline.
   - Templates rely on `onSuccess` → `invalidateQueries`, but `onSuccess` never fires for `OfflineError` (mutation rejects).
   - Programs rely on `onSuccess` → `invalidateQueries`, same problem.

3. **`isDirtyFn` used in only 1 of 6 `useOfflineQuery` consumers.**
   | Consumer | Has `isDirtyFn` | Risk |
   |----------|:---:|------|
   | `useLatestOneRms` | Yes | — |
   | `useTemplates` | No | Background refresh overwrites locally-created templates |
   | `useActivePrograms` | No | Background refresh overwrites cycle state while pending mutations exist |
   | `useProgramsCatalog` | No | Background refresh overwrites while `start_program`/`delete_program` pending |
   | `useProgramSchedule` | No | Background refresh overwrites schedule while reschedule/start pending |
   | `useHomeSummary` | No | `writeCacheFn` is a no-op, lower risk |

### Race Conditions

| # | Race | Severity | Root cause |
|---|------|----------|------------|
| 1 | **Background refresh overwrites local edits in SQLite** | High | `writeCacheFn` bulk-writes server data without checking if local rows have pending sync items or `createdLocally=true` |
| 2 | **Hydrate overwrites sync-queue changes** | High | `runTrainingSync` calls `hydrateTrainingCache` after `runSyncQueue`. If the queue has locally-deleted templates (`isDeleted=true`) that haven't synced yet, hydration replaces them with server state. |
| 3 | **Save meal has no optimistic UI** | Medium | `saveMealMutation.onMutate` only invalidates cache (clears it). No optimistic insertion into the daily summary UI. |
| 4 | **Sync queue items lack ordering** | Low | `getRunnableSyncItems` picks the first 5 rows matching `status IN (pending, failed)` with no ORDER BY. Mutations on the same entity can run out of order. |
| 5 | **Nutrition chat messages cannot be sent offline** | Medium | `sendMessage` calls `apiFetch` directly with no offline queue. |

---

## Phase 1: Fill Mutation Gaps (DRY + Offline UX)

### 1A. Add `onEnqueue` to program mutations

**File:** `apps/expo/hooks/useProgramSchedule.ts`

#### `useStartCycleWorkout` (lines 49-91)

Current: no `onEnqueue`. Offline start leaves UI unchanged.
```
tryOnlineOrEnqueue({
  apiCall: () => apiFetch(...),
  userId,
  entityType: 'program',
  operation: 'start_cycle_workout',
  entityId: cycleWorkoutId,
  payload: {},
  // NO onEnqueue
})
```

Fix:
1. Add `onEnqueue` that updates the `local_program_cycle_workouts` row's `workout_id` and `status` fields to reflect the started workout.
2. Add `onMutate` with optimistic TanStack Query cache update so the schedule UI instantly shows the workout as started.
3. Add `onError` that checks for `OfflineError` and preserves the optimistic state.

#### `useRescheduleWorkout` (lines 94-131)

Current: no `onEnqueue`. Offline reschedule leaves UI unchanged.
```
tryOnlineOrEnqueue({
  ...
  operation: 'reschedule_workout',
  payload: { scheduledAt },
  // NO onEnqueue
})
```

Fix:
1. Add `onEnqueue` that updates `local_program_cycle_workouts.scheduled_at`.
2. Add `onMutate` with optimistic TanStack Query cache update.

### 1B. Add optimistic UI to `saveMealMutation`

**File:** `apps/expo/hooks/useNutritionMutations.ts`

Current (lines 73-110):
```
const saveMealMutation = useMutation({
  mutationFn: (data) => {
    return tryOnlineOrEnqueue({
      ...
      // NO onEnqueue
    });
  },
  onMutate: async () => {
    // Only invalidates local cache — does NOT optimistically add the meal
    await invalidateDailySummary(userId, date, activeTimezone);
  },
  onSuccess: () => { refetchSummary(); },
})
```

Fix:
1. Follow the `deleteMealMutation` pattern (lines 123-138): add `onMutate` that optimistically inserts the meal into the daily summary TanStack Query cache, returning `previousSummary` as rollback context.
2. Add `onError` that:
   - Returns early if `error instanceof OfflineError` (keep optimistic state).
   - Otherwise rolls back via `queryClient.setQueryData(dailySummaryQueryKey, context.previousSummary)`.
3. Add `onEnqueue` that writes the meal to the local nutrition summary SQLite table so it persists across app restarts.

### 1C. Extract `useOfflineMutation` helper (deferred refactor)

**New file:** `apps/expo/hooks/useOfflineMutation.ts`

Once 1A and 1B establish the pattern, extract a shared utility:
```
useOfflineMutation({
  // Standard useMutation options plus:
  queryKey: [...],
  optimisticUpdate: (vars) => context,  // return rollback context
  rollback: (context) => void,
})
```

This would DRY up the `onMutate` → `onError (OfflineError check)` → `onSuccess` pattern. However, the `OfflineError` import and check are only ~4 lines per mutation, so this is optional polish.

---

## Phase 2: Fix Race Conditions

### 2A. Add `isDirtyFn` to all `useOfflineQuery` consumers

The `isDirtyFn` already correctly guards both `writeCacheFn` AND `setQueryData` (line 30-33 of `useOfflineQuery.ts` guards with early return). The issue is only 1 consumer uses it.

#### `useTemplates` (hooks/useTemplates.ts:21)

Dirty check: any template has `createdLocally === true` OR any template has a pending sync queue item.
```typescript
isDirtyFn: async () => {
  const db = getLocalDb();
  const locallyCreated = db.select({ count: sql<number>`count(*)` })
    .from(localTemplates)
    .where(and(eq(localTemplates.userId, userId!), eq(localTemplates.createdLocally, true)))
    .get();
  if ((locallyCreated?.count ?? 0) > 0) return true;
  const pending = db.select({ count: sql<number>`count(*)` })
    .from(localSyncQueue)
    .where(and(eq(localSyncQueue.userId, userId!), eq(localSyncQueue.entityType, 'template'), or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing'))))
    .get();
  return (pending?.count ?? 0) > 0;
}
```

#### `useActivePrograms` (hooks/usePrograms.ts:72)

Dirty check: any program cycle has a pending `start_cycle_workout` or `reschedule_workout` sync item.
```typescript
isDirtyFn: async () => {
  const db = getLocalDb();
  const result = db.select({ count: sql<number>`count(*)` })
    .from(localSyncQueue)
    .where(and(
      eq(localSyncQueue.userId, userId!),
      eq(localSyncQueue.entityType, 'program'),
      or(eq(localSyncQueue.operation, 'start_cycle_workout'), eq(localSyncQueue.operation, 'reschedule_workout')),
      or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
    ))
    .get();
  return (result?.count ?? 0) > 0;
}
```

#### `useProgramsCatalog` (hooks/usePrograms.ts:45)

Dirty check: pending `start_program` or `delete_program` sync items.
```typescript
isDirtyFn: async () => {
  const db = getLocalDb();
  const result = db.select({ count: sql<number>`count(*)` })
    .from(localSyncQueue)
    .where(and(
      eq(localSyncQueue.userId, userId!),
      inArray(localSyncQueue.operation, ['start_program', 'delete_program']),
      or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
    ))
    .get();
  return (result?.count ?? 0) > 0;
}
```

#### `useProgramSchedule` (hooks/useProgramSchedule.ts:40)

Dirty check: any sync item referencing this `cycleId`, or any `start_cycle_workout` or `reschedule_workout` pending.
```typescript
isDirtyFn: async () => {
  const db = getLocalDb();
  // Check for pending mutations on this cycle's workouts
  const pending = db.select({ count: sql<number>`count(*)` })
    .from(localSyncQueue)
    .where(and(
      eq(localSyncQueue.userId, userId!),
      or(eq(localSyncQueue.operation, 'start_cycle_workout'),
         eq(localSyncQueue.operation, 'reschedule_workout')),
      or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
    ))
    .get();
  return (pending?.count ?? 0) > 0;
}
```

### 2B. Protect hydration from overwriting local changes

**File:** `apps/expo/db/training-cache.ts` (modify `hydrateOfflineTrainingSnapshot`)

Current behavior: bulk-replaces all local SQLite tables with server snapshot. This destroys `isDeleted=true` flags on templates awaiting sync, and `createdLocally=true` rows.

Fix strategy (within the hydration transaction):

1. **For templates**: Before INSERT/REPLACE from server data, check if any local row exists with:
   - `isDeleted = true` AND no corresponding sync item exists (already synced the delete) → keep deleted.
   - `isDeleted = true` AND a sync item exists (pending delete) → skip hydration for this row, don't overwrite.
   - `createdLocally = true` AND no server match (created offline, not yet synced) → keep.
   - Otherwise → hydrate.

2. **For program cycles**: Before replacing schedule data, check if any cycle has pending sync items (`start_cycle_workout`, `reschedule_workout`). If so, skip hydrating that cycle and let the sync queue handle it.

3. **For workouts**: Check if any workout has status `syncing` or `conflict` in the local workouts table (`markWorkoutSyncing`/`markWorkoutConflict` set these). Skip hydrating those.

Implementation approach — add a function:
```typescript
async function getEntitiesWithPendingSync(userId: string): Promise<Set<string>> {
  const db = getLocalDb();
  const items = db.select({ entityId: localSyncQueue.entityId })
    .from(localSyncQueue)
    .where(and(
      eq(localSyncQueue.userId, userId),
      or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
    ))
    .all();
  return new Set(items.map(i => i.entityId));
}
```

Call this before hydration. Skip rows for entities in this set when hydrating templates, cycles, and workouts.

### 2C. Sync queue ordering

**File:** `apps/expo/db/sync-queue.ts`

In `getRunnableSyncItems` (line 54), add ORDER BY:
```diff
  return db
    .select()
    .from(localSyncQueue)
    .where(...)
+   .orderBy(localSyncQueue.createdAt)
    .limit(limit)
    .all();
```

This ensures mutations run in the order the user made them (FIFO). No schema change needed — `createdAt` is already a timestamp column.

---

## Phase 3: Offline Chat Messages

### 3A. Queue chat messages for offline sending

**Current:** `apps/expo/app/(app)/nutrition.tsx` `sendMessage` (line ~521) calls `apiFetch('/api/nutrition/chat')` directly. Offline → raw error message to user.

**Goal:** When offline, store the message + context in local SQLite. Show "pending" indicator on queued messages. Sync when connectivity returns.

#### Schema addition

**File:** `apps/expo/db/local-schema.ts`

```typescript
export const localChatMessageQueue = sqliteTable('local_chat_message_queue', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  date: text('date').notNull(),
  timezone: text('timezone').notNull(),
  content: text('content').notNull(),
  hasImage: integer('has_image', { mode: 'boolean' }).notNull().default(false),
  imageBase64: text('image_base64'),
  messagesJson: text('messages_json').notNull(), // serialized conversation context
  status: text('status').notNull().default('pending'), // pending, sending, sent, failed
  jobId: text('job_id'),
  assistantContent: text('assistant_content'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
```

#### Migration

**File:** `apps/expo/db/migrations.ts`

Add migration `20260503_chat_message_queue`:
```typescript
applyVersionedMigration('20260503_chat_message_queue', async (sqlite) => {
  sqlite.run(`CREATE TABLE IF NOT EXISTS local_chat_message_queue (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    timezone TEXT NOT NULL,
    content TEXT NOT NULL,
    has_image INTEGER NOT NULL DEFAULT 0,
    image_base64 TEXT,
    messages_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    job_id TEXT,
    assistant_content TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
});
```

#### Mutation changes

Modify `sendMessage` in `nutrition.tsx`:
1. Wrap in `tryOnlineOrEnqueue` with `entityType: 'chat_message'`, `operation: 'send_chat_message'`.
2. `onEnqueue`: Insert into `local_chat_message_queue`, show user message with "pending" badge in UI.
3. Keep the existing user message + placeholder assistant in UI (as is done now).

#### Sync handling

**File:** `apps/expo/lib/workout-sync.ts`

Add `send_chat_message` to `getSyncEndpoint` and `handleGenericSync`:
```typescript
case 'send_chat_message': {
  const payload = JSON.parse(item.payloadJson);
  // POST to /api/nutrition/chat with message + context
  const chatResponse = await apiFetch('/api/nutrition/chat', {
    method: 'POST',
    body: {
      messages: payload.messages,
      date: payload.date,
      timezone: payload.timezone,
      ...(payload.hasImage ? { hasImage: true, imageBase64: payload.imageBase64 } : {}),
    },
  });
  // Poll the job
  const jobStartedAt = Date.now();
  const CHAT_JOB_POLL_INTERVAL_MS = 1500;
  const CHAT_JOB_TIMEOUT_MS = 3 * 60 * 1000;
  let assistantContent = '';
  while (Date.now() - jobStartedAt < CHAT_JOB_TIMEOUT_MS) {
    const job = await apiFetch(`/api/nutrition/chat/jobs/${chatResponse.jobId}`);
    if (job.status === 'completed') { assistantContent = job.content ?? ''; break; }
    if (job.status === 'failed') throw new Error(job.error ?? 'Chat job failed');
    await delay(CHAT_JOB_POLL_INTERVAL_MS);
  }
  if (!assistantContent.trim()) throw new Error('Chat job timed out');
  // Update the local queue item with assistant content
  markChatMessageSent(item.entityId, assistantContent);
  return;
}
```

Note: This polling approach blocks other sync items. Alternative: separate chat message processing to its own async loop that doesn't block the sync queue (fire a separate `processChatMessageQueue()`).

#### UI indicators

- Queued messages show a small "pending" dot/badge (existing user message + pending indicator).
- Failed messages show a retry button.
- When the sync queue processes a chat message and gets the assistant response, the UI updates via TanStack Query `invalidateQueries`.

---

## Phase 4: Background Sync

### 4A. Add `expo-background-fetch`

**Dependencies to add:**
- `expo-background-fetch` (~55.x)
- `expo-task-manager` (~55.x)

#### Registration

**File:** `apps/expo/app/_layout.tsx`

Add to the root layout component:
```typescript
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const SYNC_TASK = 'strength-sync';

TaskManager.defineTask(SYNC_TASK, async () => {
  const session = await authClient.getSession();
  const userId = session?.user?.id;
  if (!userId) return BackgroundFetch.BackgroundFetchResult.NoData;

  try {
    await runTrainingSync(userId);
    // Also process any queued chat messages
    const chatItems = await getPendingChatMessages(userId);
    if (chatItems.length > 0) {
      await processChatMessageBatch(userId, chatItems);
    }
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// Register after auth is ready:
useEffect(() => {
  if (!userId) return;
  (async () => {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      // Not critical — sync still happens in foreground
      return;
    }
    await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (OS may defer for battery)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  })().catch(() => {});
}, [userId]);
```

#### Android config

**File:** `apps/expo/app.json`

Add:
```json
{
  "expo": {
    "plugins": [
      [
        "expo-background-fetch",
        {
          "minimumInterval": 900
        }
      ]
    ],
    "android": {
      "permissions": ["RECEIVE_BOOT_COMPLETED"]
    }
  }
}
```

#### iOS config

Background fetch requires no explicit user-facing permission on iOS but needs UIBackgroundModes in Info.plist (expo-background-fetch plugin handles this).

---

## Execution Order & Estimates

| Step | File(s) | Effort | Impact | Depends On |
|------|---------|--------|--------|------------|
| **1A.** Program `onEnqueue` + optimistic UI | `useProgramSchedule.ts`, `db/training-cache.ts` | Small | High | None |
| **1B.** `saveMealMutation` optimistic UI | `useNutritionMutations.ts` | Small | High | None |
| **2A.** Add `isDirtyFn` to all consumers | `useTemplates.ts`, `usePrograms.ts`, `useProgramSchedule.ts` | Small | High | None |
| **2B.** Protect hydration from overwrites | `db/training-cache.ts` | Medium | High | None |
| **2C.** Sync queue ordering | `db/sync-queue.ts` | Tiny | Low | None |
| **1C.** Extract `useOfflineMutation` | New: `hooks/useOfflineMutation.ts` | Medium | Low | After 1A, 1B |
| **3A.** Chat message offline queue | `local-schema.ts`, `migrations.ts`, `nutrition.tsx`, `workout-sync.ts` | Large | Medium | None |
| **4A.** Background sync | `_layout.tsx`, `app.json` | Medium | Medium | After Phase 3 for chat support |

**Total estimate:** ~4-6 days. Phases 1-2 (steps 1A through 2C) are the highest bang-for-buck and can ship as a single PR (~2 days).

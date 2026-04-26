# Offline-First Storage + Refactor Work Order

## Context

**Goal:** Enable offline-first workouts and nutrition by replacing key-value storage with local SQLite, establishing a clean query layer, and adding a sync queue.

**What changed since TODO_STORAGE.md:** Better Auth replaces the original Kinde+OIDC plan. The `@kinde/expo` crash is resolved. The Worker already has session management via Better Auth. Auth token security is already handled.

**What stays from TODO_STORAGE.md:** The local SQLite foundation, sync queue architecture, and image storage plan remain valid.

**What TODO_REFACTOR.md adds:** The domain query module structure, platform-safe DB helper, web-safe fallbacks, and the explicit refactoring work order.

## Security Model

- Do not store session tokens, refresh tokens, or reusable API credentials in SQLite, AsyncStorage, or image files.
- SQLite is for user app data and sync metadata only.
- Every local row that contains user data must be scoped to the signed-in `userId`.
- Sync requests must always be authenticated by the Worker before reading or writing remote data.

## Target Architecture

### Local DB Structure

```
apps/expo/lib/db/
  index.ts                  # low-level native DB open/init/reset only
  schema.ts                 # table names, row types, active migration statements
  safe-db.ts                # platform-safe DB helper used by query modules
  migrations/
    0001_initial.sql
    0002_sync_queue.sql
  queries/
    index.ts
    preferences.ts
    workout.ts
    nutrition.ts
    sync.ts
    images.ts

apps/expo/lib/storage.ts    # compatibility facade delegating to query modules
apps/expo/lib/images.ts     # file operations; delegates DB metadata to queries
```

Rules:

- Screens, hooks, and components must not import `getLocalDb()`.
- Only low-level DB files and query modules may call `getLocalDb()`.
- Query modules own SQL, row mapping, dirty flags, user scoping, and web-safe fallbacks.
- Feature code calls domain functions such as `insertNutritionEntry`, `getPendingWorkouts`, or `setPreference`.
- `storage.ts` remains temporarily as a compatibility facade.

### App Data Storage

Use local SQLite for offline app data:

- Native: `expo-sqlite`.
- Web: no-op fallbacks (web offline deferred).
- Dirty record tracking and sync queue for local writes.
- `expo-file-system` for nutrition pending image blobs.
- Existing `apiFetch` stays as the network transport for online sync.

## Phase 0: Prerequisite — Server Schema Must Be Stable

Before creating any local tables, `TODO_SCHEMA.md` must be fully implemented and the remote database reset (`bun run db:push` or recreate D1). The local schema intentionally mirrors the server schema. If server columns are still in flux, local migrations will require duplicate rework.

Specifically confirm before proceeding:
- `workouts` and `workoutSets` no longer contain per-record timezone/date text columns.
- `workouts.programCycleId` has the FK with `onDelete: 'set null'`.
- `programCycleWorkouts.scheduledAt` is the sole schedule field (no `scheduledDate`, `scheduledTime`, `scheduledTimezone`).
- `rate_limit.windowStart` is `integer('window_start', { mode: 'timestamp_ms' })`.
- All API endpoints have removed `timezone` from request bodies and query params (server reads `userPreferences.timezone`).

## Phase 1: Local DB Foundation

### 1.1 Add Dependencies

```bash
bun --filter @strength/expo add expo-sqlite expo-file-system
```

Verify `expo-file-system` is explicitly listed in `apps/expo/package.json` (do not rely on transitive availability from `expo-image-picker`).

### 1.2 Create `apps/expo/lib/db/schema.ts`

Local schema mirrors server tables needed for offline UX, plus sync metadata.

Core local tables:

```typescript
localUserPreferences   // user_id, preference_key, preference_value
localExercises          // exercise definitions (cached)
localTemplates          // user templates
localTemplateExercises  // template exercises scoped by user_id
localWorkouts           // local workouts with sync metadata
localWorkoutExercises   // workout exercises scoped by user_id
localWorkoutSets        // workout sets scoped by user_id
localUserProgramCycles  // program cycle progress
localProgramCycleWorkouts // cycle workouts scoped by user_id
localNutritionEntries   // nutrition log entries
localNutritionChatMessages // chat history cache
localNutritionTrainingContext // training context
localUserBodyStats      // body stats
localWhoopSummaryCache  // cached WHOOP data
```

Sync metadata columns on syncable tables:

```typescript
localId: text primary key    // client-generated ID
serverId: text | null        // set after server confirms
userId: text not null        // always required
isDirty: boolean default false
dirtyAt: timestamp_ms | null
deletedAt: timestamp_ms | null
lastSyncedAt: timestamp_ms | null
syncVersion: integer default 0
```

### 1.3 Create `apps/expo/lib/db/index.ts`

```typescript
export async function initLocalDb(): Promise<void>;
export async function getLocalDb(): Promise<LocalDatabase>;
export async function resetLocalDbForUser(userId: string): Promise<void>;
```

- Use `expo-sqlite`.
- Store DB in default app document/database location.
- Migrations run on init.

### 1.4 Create `apps/expo/lib/db/migrations/`

Create timestamped migration files:

```text
0001_initial.sql     // create all local tables
0002_sync_queue.sql  // create sync queue table
```

Migrations create tables, indexes, and user scoping indexes:

- `(user_id, server_id)`
- `(user_id, is_dirty, dirty_at)`
- `(user_id, deleted_at)`
- `sync_queue(created_at)`

## Phase 2: Platform-Safe DB Helper

Create `apps/expo/lib/db/safe-db.ts`.

```typescript
export function isLocalDbSupported(): boolean;

export async function getOptionalLocalDb(): Promise<LocalDatabase | null>;

export async function withLocalDb<T>(
  fallback: T,
  fn: (db: LocalDatabase) => Promise<T>,
): Promise<T>;
```

- Native: initialize/open the local DB and run the callback.
- Web: return the fallback without throwing.
- Unexpected native DB errors: log context and return fallback for read-safe operations.

## Phase 3: Domain Query Modules

Create `apps/expo/lib/db/queries/`.

### `queries/preferences.ts`

Owns local user preferences.

Functions:

- `getPreference(userId: string, key: string): Promise<string | null>`
- `setPreference(userId: string, key: string, value: string): Promise<void>`
- `deletePreference(userId: string, key: string): Promise<void>`
- `getDismissedDeviceTimezone(userId: string): Promise<string | null>`
- `setDismissedDeviceTimezone(userId: string, timezone: string | null): Promise<void>`

Web: reads return `null`, writes no-op.

### `queries/workout.ts`

Owns local workout, workout exercise, and set persistence.

Functions:

- `getLastWorkout(exerciseId: string): Promise<LastWorkoutData | null>`
- `getPendingWorkouts(userId: string): Promise<PendingWorkout[]>`
- `insertWorkout(...)`
- `insertWorkoutExercise(...)`
- `insertWorkoutSet(...)`
- `updateWorkoutComplete(...)`
- `updateWorkoutDeleted(...)`
- `updateWorkoutSet(...)`
- `markWorkoutSetsDirty(...)`

Web: reads return empty, writes no-op.

### `queries/nutrition.ts`

Owns local nutrition entries, chat history, chat draft, and training context.

Functions:

- `getNutritionChatMessages(userId: string, startOfDayUtc: number, endOfDayUtc: number)` — queries by `createdAt` UTC range.
- `setNutritionChatMessages(userId: string, messages: ChatMessage[])` — overwrites the day's cache; caller computes the UTC range.
- `getNutritionChatDraft(userId: string, date: string)` — `date` is local date string used as cache key.
- `setNutritionChatDraft(userId: string, date: string, draft: string)`
- `insertNutritionEntry(...)`
- `markNutritionEntryDeleted(...)`
- `upsertTrainingContext(userId: string, trainingType: string, customLabel?: string)` — no `date`/`timezone` fields; single row per user, updated in place.
- `insertNutritionChatMessage(...)` — stores with `createdAt` UTC.

Web: reads return empty, writes no-op.

> **Note:** `TODO_SCHEMA.md` removed `date` and `eventTimezone` from `nutritionChatMessages` and `nutritionTrainingContext`. Local queries must group by `createdAt` UTC range only. Do not store per-record timezone offsets or local date strings in these tables.

### `queries/sync.ts`

Owns SQL for the local sync queue.

Functions:

- `enqueueSyncOperation(operation)`
- `getPendingSyncOperations(): Promise<SyncQueueRow[]>`
- `deleteSyncOperation(localId: string): Promise<void>`
- `updateSyncOperationAttempt(localId: string, error: string): Promise<void>`
- `markSyncedEntity(entityType: string, localId: string, serverId: string | null): Promise<void>`

Web: queue reads return `[]`, writes no-op.

### `queries/images.ts`

Owns DB metadata for pending nutrition images.

Functions:

- `insertPendingImageMetadata(userId: string, date: string, uri: string): Promise<void>`
- `getPendingImageMetadata(userId: string, date: string): Promise<{ uri: string; createdAt: Date } | null>`
- `deletePendingImageMetadata(userId: string, date: string): Promise<void>`
- `getOldPendingImageMetadata(userId: string, cutoffTime: number): Promise<Array<{ uri: string }>>`
- `deleteOldPendingImageMetadata(userId: string, cutoffTime: number): Promise<void>`

Web: reads return `null`/`[]`, writes no-op.

## Phase 4: Sync Queue + API Contract

### 4.1 Create `apps/expo/lib/db/sync.ts`

```typescript
export async function syncToServer(): Promise<SyncResult>;
export async function enqueueSyncOperation(operation: SyncOperation): Promise<void>;
export async function isOnline(): Promise<boolean>;
export function setupNetworkListener(callback: (online: boolean) => void): () => void;
```

Sync queue table:

```typescript
syncQueue: {
  id,
  userId,
  entityType,
  localId,
  serverId,
  operation,       // INSERT | UPDATE | DELETE | UPSERT
  payloadJson,
  idempotencyKey,
  createdAt,
  attempts,
  lastAttemptAt,
  lastError
}
```

Processing flow:

1. Confirm network is online.
2. Refresh/validate session with Worker via Better Auth.
3. Select oldest queue entries for the active user.
4. Send operations with idempotency keys.
5. On success, update `serverId`, clear dirty flags, delete queue entry.
6. On conflict, resolve using entity-specific policy.
7. On failure, increment attempts and keep queue entry.

### 4.2 Idempotent Server Writes

Current server `POST` endpoints generate IDs and can duplicate records on retry. Do not modify server DB schema. Instead:

- Accept client-generated IDs for syncable entities after ownership validation.
- Add `idempotencyKey` support per user and endpoint.

Needed for: workouts, workout exercises, workout sets, nutrition entries, nutrition training context, user body stats.

### 4.3 Conflict Policy

Default: last-write-wins using local `dirtyAt` and server `updatedAt`.

Entity-specific:

- Workout sets: prefer local dirty set state during an active workout.
- Deletes: tombstones win over stale updates.
- Nutrition chat messages: append-only.
- User preferences/body stats: last-write-wins.

## Phase 5: Image Storage

Create `apps/expo/lib/images.ts`.

```typescript
import * as FileSystem from 'expo-file-system';

const IMAGE_DIR = `${FileSystem.cacheDirectory}nutrition_images/`;

export async function savePendingImage(base64: string): Promise<string>;
export async function readImageAsBase64(uri: string): Promise<string>;
export async function deleteImage(uri: string): Promise<void>;
export async function cleanupOrphanedImages(userId: string): Promise<void>;
```

Image lifecycle:

```
capture -> savePendingImage() -> store file URI + userId + createdAt locally
submit online -> readImageAsBase64(uri) -> API call -> deleteImage(uri)
abandon/offline -> keep metadata locally -> cleanup files older than policy
```

Do not store base64 image blobs in SQLite or AsyncStorage.

**Immediate security fix (can be done before full refactor):** `apps/expo/lib/storage.ts` currently stores `NutritionPendingImage` with a `base64` field in **AsyncStorage**. This violates the security model. As a stopgap, change `setNutritionPendingImage` / `getNutritionPendingImage` to store **only the file URI** (using `expo-file-system` or `expo-secure-store`), not the base64 string. The base64 payload can be re-read from disk at submission time via `readImageAsBase64(uri)`.

## Phase 6: Workout Flow Local-First

Current issue:

- `startWorkout` calls `/api/workouts` before creating local state.
- `completeWorkout` fetches server state and writes each server set before local completion.

Target behavior:

1. Create local workout immediately.
2. Create local workout exercises/sets immediately.
3. Enqueue sync operations.
4. UI reads from local DB.
5. If online, sync in background.
6. Completion marks local workout complete first, then syncs.

This applies to: manual workout start, program workout start, add/remove exercise, add/update/delete set, complete workout, discard workout.

## Phase 7: Route Access (Use Existing Guards)

**Do not create `apps/worker/src/api/access.ts`.** `apps/worker/src/api/guards.ts` already contains the required ownership helpers:

- `requireOwnedWorkout`
- `requireOwnedNutritionEntry`
- `requireOwnedProgramCycle`
- `requireOwnedProgramCycleWorkout`
- `requireOwnedTemplate`
- `requireOwnedWorkoutExercise`
- `requireOwnedWorkoutSet`

If a new resource type needs ownership checks (e.g., `userBodyStats`), add a `requireOwnedBodyStat` helper directly in `guards.ts` following the existing pattern (return the row or a 404 Response). Do not introduce a generic dispatcher abstraction.

## Phase 8: Refactor Call Sites

### 8.1 `apps/expo/lib/storage.ts`

- Convert to a facade over `queries/preferences`, `queries/workout`, and `queries/nutrition`.
- Keep exported function names stable where practical.
- Remove `NutritionPendingImage.base64` from AsyncStorage as part of the image security fix (see Phase 5).

### 8.2 `apps/expo/lib/images.ts`

- Delegate DB metadata to `queries/images`.
- Keep file reads/writes/deletes here.

### 8.3 `apps/expo/lib/db/sync.ts` (new orchestration module)

- This file is created in Phase 4.1 and refined here.
- Delegate queue SQL to `queries/sync`.
- Keep network state, periodic sync loop, and API calls here.

### 8.4 `apps/expo/hooks/useWorkoutSession.ts`

- This file does **not** currently import `getLocalDb()`; it talks directly to the server via `apiFetch`.
- Replace server-first workout flow with local-first flow: create local workout/sets immediately, enqueue sync operations, then optionally sync in background.
- Replace `setLastWorkout` / `getLastWorkout` calls with `queries/workout` equivalents.
- Remove `addPendingWorkout` usage once workouts are fully local.

### 8.5 `apps/expo/app/(app)/nutrition.tsx`

- This file does **not** currently import `getLocalDb()`; it uses `storage.ts` helpers.
- Replace `storage.ts` nutrition chat/draft/pending-image calls with `queries/nutrition` and `queries/images`.
- Add offline queueing: if `sendMessage` fails with a network error, store the pending message locally and let the sync loop retry.

### 8.6 `apps/expo/app/program-schedule.tsx`

- Fix the `cycleWorkoutId` field in `addPendingWorkout` (line ~391 currently passes `result.workoutId` which is the `workouts.id`, not the `programCycleWorkouts.id`). Verify the API response shape and use the correct ID.
- Update `handleStartWorkout` to use local workout creation (via `queries/workout`) instead of relying solely on `apiFetch`, then enqueue sync.

## Implementation Order

| Step | Task | Notes |
|------|------|-------|
| 0 | **Finish `TODO_SCHEMA.md` first** | Server schema must be stable. Reset DB. Pass `bun run check` and `bun run test`. |
| 0.1 | Fix `program-schedule.tsx` / `useProgramSchedule.ts` to use `scheduledAt` instead of removed `scheduledDate`/`scheduledTime` | This is a server-schema-dependent frontend fix. |
| 1 | Add `expo-sqlite` and `expo-file-system` to `apps/expo/package.json` | Verify explicit dependency, not transitive. |
| 2 | Create `apps/expo/lib/db/schema.ts` with all local tables | Mirror post-`TODO_SCHEMA.md` server tables. |
| 3 | Create `apps/expo/lib/db/migrations/0001_initial.sql` | Include user-scoping indexes. |
| 4 | Create `apps/expo/lib/db/index.ts` with `initLocalDb`, `getLocalDb`, `resetLocalDbForUser` | Use default app document/database location. |
| 5 | Create `apps/expo/lib/db/safe-db.ts` platform helper | Native: init + callback. Web: return fallback. |
| 6 | Create `apps/expo/lib/db/queries/preferences.ts` | |
| 7 | Create `apps/expo/lib/db/queries/workout.ts` | |
| 8 | Create `apps/expo/lib/db/queries/nutrition.ts` | |
| 9 | Create `apps/expo/lib/db/queries/sync.ts` | |
| 10 | Create `apps/expo/lib/db/queries/images.ts` | |
| 11 | Create `apps/expo/lib/db/migrations/0002_sync_queue.sql` | |
| 12 | Create `apps/expo/lib/db/sync.ts` orchestration | Network listener, periodic sync loop. |
| 13 | Create `apps/expo/lib/images.ts` file operations | |
| 13.1 | **Security stopgap:** Remove `base64` from `storage.ts` pending-image storage | Can land independently before full refactor. |
| 14 | Refactor `apps/expo/lib/storage.ts` to facade over query modules | Keep exported names stable. |
| 15 | Refactor `apps/expo/lib/db/sync.ts` to delegate queue SQL to `queries/sync` | |
| 16 | Refactor `apps/expo/hooks/useWorkoutSession.ts` to local-first | Create local workout immediately; sync in background. |
| 17 | Refactor `apps/expo/app/(app)/nutrition.tsx` to use `queries/nutrition` | Add offline message queueing. |
| 18 | Refactor `apps/expo/app/program-schedule.tsx` | Fix `cycleWorkoutId` bug; local-first workout start. |
| 19 | Add idempotent endpoints on server | Accept client-generated IDs + idempotency keys. |
| 20 | Implement sign-out purge | Hook `resetLocalDbForUser` into auth sign-out flow; clear SecureStore. |
| 21 | Test end-to-end offline workout flow | Verify 14-day grace period warning. |

## Files Summary

Expected new files:

| Action | Path |
|--------|------|
| CREATE | `apps/expo/lib/db/schema.ts` |
| CREATE | `apps/expo/lib/db/index.ts` |
| CREATE | `apps/expo/lib/db/safe-db.ts` |
| CREATE | `apps/expo/lib/db/queries/index.ts` |
| CREATE | `apps/expo/lib/db/queries/preferences.ts` |
| CREATE | `apps/expo/lib/db/queries/workout.ts` |
| CREATE | `apps/expo/lib/db/queries/nutrition.ts` |
| CREATE | `apps/expo/lib/db/queries/sync.ts` |
| CREATE | `apps/expo/lib/db/queries/images.ts` |
| CREATE | `apps/expo/lib/db/migrations/0001_initial.sql` |
| CREATE | `apps/expo/lib/db/migrations/0002_sync_queue.sql` |
| CREATE | `apps/expo/lib/images.ts` |

Expected modified files:

| Action | Path |
|--------|------|
| MODIFY | `apps/expo/lib/storage.ts` |
| MODIFY | `apps/expo/hooks/useWorkoutSession.ts` |
| MODIFY | `apps/expo/app/(app)/nutrition.tsx` |
| MODIFY | `apps/expo/app/program-schedule.tsx` |
| MODIFY | `apps/expo/lib/api.ts` (if needed for offline retry logic) |
| MODIFY | `apps/worker/src/index.ts` (idempotent endpoints) |

## Decisions (Closed)

| Decision | Resolution |
|----------|------------|
| **Offline grace period** | **14 days** since last successful online sync. After 14 days, warn the user that data may be stale and force a sync attempt before allowing new writes. |
| **Web offline in first pass** | **Deferred.** Web uses no-op fallbacks for all local DB reads/writes. Do not build web-specific IndexedDB or localStorage shims in this phase. |
| **Sign-out purges local data** | **Yes.** `resetLocalDbForUser(userId)` must be called on sign-out. In addition, the Better Auth `client.signOut()` flow must clear Expo Secure Store / AsyncStorage session artifacts so the user cannot re-enter the app without re-authenticating. No cached credentials or user data may remain on disk. |
| **Nutrition AI requests offline** | **Queue for later.** Users can type a message while offline. The message is stored locally with a "pending" indicator and submitted to `/api/nutrition/chat` when connectivity returns. The user may navigate away; the sync queue will retry in background. |

## Consistency Rules For Future Work

- **Server schema is the source of truth.** Finish `TODO_SCHEMA.md` before mirroring tables locally.
- Add tables and columns in `schema.ts` first.
- Ensure every user-data table has direct `user_id` unless documented.
- Add query functions in appropriate `queries/*` module.
- Query functions must define native behavior and web fallback behavior.
- Screens/hooks/components must call query or service functions, never raw DB methods.
- Syncable writes must set dirty metadata and enqueue sync in one shared place.
- Do not introduce new ad hoc storage wrappers for feature data.
- Do not store auth tokens, refresh tokens, or reusable credentials in SQLite.
- Do not store base64 image blobs in SQLite, AsyncStorage, or SecureStore. Use `expo-file-system`.

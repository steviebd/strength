# TODO: Make Training Writes Local-First and Fast

> Date: 2026-05-07
> Goal: keep D1 as the source of truth while making the Expo SQLite database the user's immediate read/write surface for program start, active workout logging, and workout completion.

## Progress

- Implemented the core local-first training write path:
  - Added Drizzle compatibility guard tests that lock in the current D1-vs-Expo driver mismatch: D1 is async and has `db.batch`, Expo SQLite Drizzle is sync and has no matching `db.batch`.
  - Moved the program generator surface into `@strength/db` under `packages/db/src/programs`.
  - Added shared `createProgramStartPlan` and `createProgramAdvancePlan` under `packages/db/src/training`.
  - Exported shared planners and program generation from `@strength/db` and `@strength/db/client`.
  - Added Expo local `createLocalProgramCycleFromStartPayload` and `advanceLocalProgramCycleAfterWorkout`.
  - Made program start local-first: it creates a complete local cycle/schedule, enqueues `start_program`, navigates immediately, and starts background sync.
  - Preserved client-generated program cycle workout IDs through D1 sync so local cycle workout references reconcile cleanly.
  - Made workout completion local-first: it enqueues sync, advances local program state, and starts `runTrainingSync` without awaiting D1.
  - Removed server-side `recomputeHomeSummary` from workout completion response paths; home summary still recomputes lazily on read.
  - Added a serialized/coalesced local write queue and moved active draft saves to 1500 ms coalesced writes.
  - Changed active draft persistence to upsert/delete changed local exercise/set rows instead of full graph replacement. Full replacement remains for initial local creation and server snapshot hydration.

## Current Finding

SQLite is not unused. The app already has a substantial local training cache:

- Local tables exist for workouts, workout exercises, sets, program cycles, program cycle workouts, templates, user exercises, recent history, pending workouts, and the sync queue in `apps/expo/db/local-schema.ts`.
- Training reads are mostly cache-first through `useOfflineQuery` in `apps/expo/hooks/useOfflineQuery.ts`.
- Home summary and program schedule can render from SQLite through `buildLocalHomeSummary` and `getCachedProgramSchedule` in `apps/expo/db/training-cache.ts`.
- Sync runs on mount, focus, foreground, first sync, and a 15-minute background task through `runTrainingSync` in `apps/expo/lib/workout-sync.ts`.

The issue is narrower and more important: critical write paths are not truly local-first, and the local write implementation is too expensive during active workouts. D1 should remain authoritative, but user-facing writes should commit locally first, update React Query from local state, enqueue durable sync work, and let the server reconcile in the background.

## Problems To Fix

### 1. Program Start Is Online-First

Files:

- `apps/expo/app/(app)/programs.tsx`
- `apps/expo/lib/offline-mutation.ts`
- `apps/expo/lib/workout-sync.ts`
- `apps/worker/src/routes/programs.ts`
- `apps/worker/src/programs/*`
- `packages/db/src/program/*`

Current behavior:

- `handleStartProgram` calls `tryOnlineOrEnqueue`.
- `tryOnlineOrEnqueue` awaits the network first and only enqueues after `Network request failed`.
- The server generates the full program cycle, schedule, exercise mappings, and D1 rows before the user can proceed.
- Offline fallback only calls `cacheActivePrograms` with a shallow active-program row. It does not create `local_program_cycle_workouts`, so local schedule/current workout support is incomplete until a server hydration succeeds.
- Generic `start_program` sync in `runSyncQueue` posts to D1 but ignores the returned cycle payload. Cache repair depends on a later `/api/training/offline-snapshot` hydration.

Why this is slow:

- Program generation and exercise resolution happen in the request path.
- The app already has local program-cycle tables, but start-program only uses them as a shallow offline fallback.
- The first screen after start needs local program cycle and workout rows, not a network round trip.

Target behavior:

- Starting a program should write a complete local cycle and schedule immediately.
- The UI should close the modal and navigate to Home using the generated local cycle ID.
- A `start_program` queue item should sync the exact payload to D1 in the background.
- When D1 confirms, the client should hydrate/reconcile from the server without blocking the start flow.

### 2. Active Workout Draft Writes Rewrite Everything

Files:

- `apps/expo/hooks/useWorkoutSession.ts`
- `apps/expo/db/workouts.ts`
- `apps/expo/db/client.ts`

Current behavior:

- Every workout/exercise/set state change starts a 400 ms debounce.
- The debounce calls `saveLocalWorkoutDraft`.
- `saveLocalWorkoutDraft` calls `replaceLocalExercises`.
- `replaceLocalExercises` deletes all local sets and exercises for the workout, then reinserts every exercise and every set.
- `withLocalTransaction` uses `sqlite.withTransactionSync()`, and all Drizzle calls use synchronous `.run()`, `.get()`, and `.all()`.

Why this is slow:

- Editing one set value causes O(total exercises + total sets) write amplification.
- The work runs in a synchronous SQLite transaction on the JS thread.
- During active logging, this can run many times per minute.
- `completeWorkout` also calls `saveLocalWorkoutDraft` and then `completeLocalWorkout`, causing two full rewrites before sync.

Target behavior:

- Active workout persistence should update only changed rows.
- Draft persistence should be coalesced through a single writer queue so frequent UI changes cannot overlap or block interaction.
- Completion should flush once, mark local rows complete, enqueue sync, and return control to the UI without waiting for D1.

### 3. Workout Completion Waits For Server Sync

Files:

- `apps/expo/hooks/useWorkoutSession.ts`
- `apps/expo/lib/workout-sync.ts`
- `apps/expo/db/workouts.ts`
- `apps/expo/db/training-cache.ts`
- `apps/worker/src/routes/workouts.ts`
- `apps/worker/src/api/home/summary.ts`

Current behavior:

- `completeWorkout` saves the draft locally, marks it completed locally, enqueues `complete_workout`, then immediately awaits `runWorkoutSync`.
- `runWorkoutSync` posts `/api/workouts/:id/sync-complete`.
- The server persists workout rows, deletes/reinserts all server exercises/sets, advances the program cycle, recomputes home summary, fetches a full workout snapshot, and only then returns.
- The client only updates local program advancement from the server response or calls `markLocalCycleWorkoutComplete`, which marks the workout complete but does not advance `local_program_cycles.currentWeek/currentSession`.

Why this is slow:

- The finish button waits for the network and D1 writes even though the local database already has the completed workout.
- `recomputeHomeSummary` scans weekly workouts plus up to 500 recent workouts over a 365-day range and is run inside the completion request path.
- Program advancement is treated as server feedback instead of being derived locally for immediate UI.

Target behavior:

- Finish should complete locally and dismiss immediately.
- The app should mark the local cycle workout complete and advance the local cycle pointer optimistically.
- Background sync should push the completion to D1 and reconcile with the authoritative server response later.
- Server home summary recompute should be removed from the critical completion response path.

## Implementation Plan

### Phase 0: Add Measurement Before Changing Behavior

Purpose: confirm improvements and avoid guessing.

Tasks:

- Add development-only timing around:
  - `handleStartProgram` from tap to local navigation.
  - `saveLocalWorkoutDraft` duration and exercise/set counts.
  - `completeWorkout` from tap to UI unlock.
  - `runSyncQueue` item duration by operation.
  - Worker `POST /api/programs`.
  - Worker `POST /api/workouts/:id/sync-complete`.
  - `recomputeHomeSummary`.
- Keep logs behind `__DEV__` on Expo and normal worker console timing on the Worker.
- Do not ship user-facing telemetry until the behavior is proven locally.

Acceptance criteria:

- A developer can reproduce before/after timings from Android logs and Worker logs.
- Timings include enough row counts to show write amplification, especially exercises and sets per draft save.

### Phase 0.5: Create A Shared Domain Command Layer

Purpose: keep D1 and SQLite behavior DRY without forcing one database driver abstraction to fit two very different runtimes.

Do not duplicate business rules in Expo and Worker. The shared code should decide what should happen; each database adapter should only decide how to persist it.

Recommended shape:

- Put pure, database-free training command logic under `packages/db/src/training/` or `packages/db/src/domain/training/`.
- Export those functions through `packages/db/src/client.ts` when they are safe for Expo.
- Keep SQL/Drizzle calls in app-specific adapters:
  - Expo adapter: `apps/expo/db/*`
  - Worker adapter: `apps/worker/src/*` or shared D1 helpers in `packages/db/src/*` when they are D1-only.
- Shared functions should accept plain objects and return plain write plans. They should not import Hono, Expo, Drizzle drivers, React Query, or platform storage.

Suggested shared modules:

- `packages/db/src/training/program-start.ts`
  - Builds the canonical program-start plan from payload, program config, timezone, and generated IDs.
  - Returns `{ cycle, cycleWorkouts, syncPayload }`.
  - Used by both `apps/expo/app/(app)/programs.tsx` and `apps/worker/src/routes/programs.ts`.

- `packages/db/src/training/program-advance.ts`
  - Given a cycle and ordered cycle workouts, computes the next cycle state after a workout is completed.
  - Returns `{ completedCycleWorkoutId, nextCurrentWeek, nextCurrentSession, totalSessionsCompleted, status, isComplete }`.
  - Used by local optimistic advancement and Worker `advanceProgramCycleForWorkout`.

- `packages/db/src/training/workout-completion.ts`
  - Normalizes completion payloads and computes totals.
  - Returns canonical workout/exercise/set rows and aggregate totals.
  - Used by Expo `completeLocalWorkout` and Worker `sync-complete`.

- `packages/db/src/training/workout-graph-diff.ts`
  - Computes inserts/updates/deletes for exercises and sets from `existingGraph` and `nextGraph`.
  - Used by Expo draft persistence first; can later be used by Worker sync-complete if D1 write latency remains high.

Adapter responsibilities:

- Expo SQLite adapter:
  - Reads existing local rows.
  - Calls shared planner/diff functions.
  - Applies returned write plan with local SQLite.
  - Enqueues sync items.
  - Updates React Query outside the shared layer.

- Worker D1 adapter:
  - Validates auth and ownership.
  - Reads D1 rows.
  - Calls shared planner/diff functions.
  - Applies returned write plan with D1.
  - Returns authoritative D1 snapshot.

Important boundary:

- Avoid trying to share a generic repository interface too early. It can become leaky because D1 uses remote async writes and Expo SQLite currently uses local synchronous Drizzle calls.
- Share deterministic domain logic first: ID planning, schedule generation, target-lift serialization, totals, graph diffing, and cycle advancement.
- Keep database transactions close to the adapter where the actual driver behavior is visible.

Tests:

- Add package-level unit tests for every shared planner:
  - Same program-start input produces the same cycle metadata and cycle workout plan for client and worker.
  - Program advancement is correct for middle, final, already-complete, and missing-current cases.
  - Workout totals match current server/client behavior.
  - Workout graph diff only changes modified rows.
- Keep app-level adapter tests smaller:
  - Expo applies the plan to SQLite and enqueues sync.
  - Worker applies the same plan to D1 and returns the expected response.

Acceptance criteria:

- Program start, program advancement, workout completion totals, and workout graph diff rules live in shared package code.
- Expo and Worker call the same shared planner functions.
- App-specific code contains persistence, auth, queueing, and UI/cache concerns only.
- Future fixes to training business rules do not require parallel edits in Expo and Worker.

### Phase 1: Make Workout Completion Non-Blocking

This is the highest impact and smallest behavioral change because completion already has a queue path.

Client tasks:

- In `apps/expo/hooks/useWorkoutSession.ts`:
  - Remove the blocking `await runWorkoutSync(session.data.user.id)` from `completeWorkout`.
  - After `completeLocalWorkout`, keep `enqueueWorkoutCompletion`.
  - Start background sync with `void runTrainingSync(userId)` or `void runSyncQueue(userId)` only after local UI state has been updated. Prefer `runTrainingSync` if hydration should follow, but do not await it.
  - Ensure `setIsLoading(false)` happens after local completion, not after network sync.
  - Update query caches/invalidation for `homeSummary`, `programSchedule`, `activePrograms`, `workoutHistory`, and the completed workout from local state.

- In `apps/expo/db/training-cache.ts`:
  - Add `advanceLocalProgramCycleAfterWorkout(input)` that can compute the next `currentWeek/currentSession` from `local_program_cycle_workouts`.
  - It should:
    - Mark `completedCycleWorkoutId` complete with `workoutId`.
    - Increment `totalSessionsCompleted`.
    - Move `currentWeek/currentSession` to the next incomplete workout ordered by week/session.
    - Mark the cycle complete if no incomplete workouts remain.
  - Keep `markLocalProgramAdvance` for server reconciliation, but make local completion use the new local-derived helper immediately.

- In `apps/expo/db/workouts.ts`:
  - Keep `completeLocalWorkout` as the local source for completed workout rows.
  - Either call the new program-advance helper from `completeWorkout`, or extend `completeLocalWorkout` to handle program-cycle advancement when `workout.cycleWorkoutId` and `workout.programCycleId` are present.

- In `apps/expo/lib/workout-sync.ts`:
  - Continue handling `complete_workout` as the authoritative D1 sync.
  - After a successful response, keep calling `upsertServerWorkoutSnapshot`, `markLocalProgramAdvance`, `markWorkoutSynced`, and `deleteSyncItem`.
  - On conflict, leave the local workout visible with `syncStatus: 'conflict'` and show existing offline/sync UI.

Server tasks:

- In `apps/worker/src/routes/workouts.ts`:
  - Remove `await recomputeHomeSummary(db, userId)` from `POST /:id/sync-complete`.
  - Also remove or decouple it from `PUT /:id/complete` if that endpoint is still user-facing.
  - Keep `advanceProgramCycleForWorkout` in the completion transaction/flow because D1 remains source of truth for program state.

- In `apps/worker/src/api/home/summary.ts`:
  - Let `GET /api/home/summary` recompute lazily when stale. This already exists through `needsRecompute`.
  - Consider making `recomputeHomeSummary` incremental later, but do not block Phase 1 on that.

Tests:

- Update `apps/expo/hooks/useWorkoutSession.test.ts`:
  - Assert `completeWorkout` enqueues completion but does not await `runWorkoutSync`.
  - Assert local program advancement helper is called for program workouts.
  - Assert local completion still runs when `runTrainingSync` rejects.

- Update or add `apps/expo/db/training-cache.test.ts`:
  - Current workout in middle of cycle advances to next incomplete workout.
  - Last workout completes the local cycle.
  - Already-complete workout is idempotent.

- Update worker tests around `sync-complete`:
  - Assert completion response no longer depends on successful home summary recompute.

Acceptance criteria:

- Tapping Finish Workout unlocks UI after local SQLite completion and queue insert only.
- Airplane-mode completion works and shows completed workout/history locally.
- Home/program schedule reflect the completed workout and next workout immediately.
- D1 sync still eventually marks the workout `synced`.

### Phase 2: Replace Full Draft Rewrites With Incremental Local Writes

This is the biggest local performance fix.

Client DB tasks:

- In `apps/expo/db/workouts.ts`, replace `replaceLocalExercises` for draft saves with an incremental function, for example `upsertLocalWorkoutDraftGraph(workoutId, exercises)`.
- Keep full replacement available only for server snapshot hydration if that remains simpler, but do not use it for every active draft keystroke.
- Algorithm for draft persistence:
  - Load existing exercise IDs for the workout and existing set IDs for those exercises.
  - Build incoming exercise/set maps from React state.
  - For exercises:
    - Insert missing rows.
    - Update existing rows only when persisted fields changed.
    - Soft-delete or hard-delete rows missing from incoming state. Current draft behavior hard-deletes; choose one behavior and keep it consistent with local cleanup.
  - For sets:
    - Insert missing rows.
    - Update existing rows only when `setNumber`, `weight`, `reps`, `rpe`, `duration`, `distance`, `height`, `isComplete`, or `completedAt` changed.
    - Delete or soft-delete rows missing from incoming state.
  - Preserve IDs generated in React state. Do not regenerate IDs during persistence unless an ID collision is detected.

- Avoid nested transactions:
  - `createLocalWorkout`, `saveLocalWorkoutDraft`, and `completeLocalWorkout` currently call `replaceLocalExercises` inside `withLocalTransaction`, while `replaceLocalExercises` also starts a transaction.
  - Refactor lower-level graph persistence to assume the caller owns the transaction, or make transaction ownership explicit.

- In `apps/expo/db/client.ts`:
  - Add an async transaction helper only if Expo SQLite + Drizzle support can be used safely in this project.
  - Do not do a risky global migration from sync Drizzle to async Drizzle in one pass. Start with reducing write volume first.
  - If async Drizzle is not practical, create a serialized local write queue so synchronous work happens less often and never overlaps.

Hook tasks:

- In `apps/expo/hooks/useWorkoutSession.ts`:
  - Increase draft debounce from `400` ms to `1500` ms.
  - Add a flush on app background/unmount for active workouts.
  - Track dirty state so adding/updating/deleting a set schedules one coalesced save.
  - Log draft-save errors in development instead of silently dropping them.
  - On `completeWorkout`, cancel the debounce and perform exactly one final persistence pass.

Tests:

- Add/extend `apps/expo/db/workouts.test.ts`:
  - Updating one set updates that row without deleting/reinserting unchanged exercises.
  - Deleting a set removes/marks only that set and renumbers remaining sets.
  - Removing an exercise removes/marks only that exercise and its sets.
  - Completion persists totals correctly after incremental draft saves.

- Add/extend `apps/expo/hooks/useWorkoutSession.test.ts`:
  - Debounce is 1500 ms.
  - Completion flushes pending draft save once.
  - Draft save errors do not break active logging.

Acceptance criteria:

- Editing one set does not rewrite the whole workout graph.
- Draft saves no longer cause noticeable Android UI pauses on normal active workouts.
- Finish Workout performs one local completion write and one queue insert before UI unlock.

### Phase 3: Make Program Start Local-First

This requires sharing program-generation code with Expo instead of keeping it Worker-only.

Shared-code tasks:

- Move the program generator surface from `apps/worker/src/programs/*` into a shared package that Expo can import, preferably `packages/db/src/programs/*` or a new workspace package if separation is desired.
- Export from `@strength/db/client`:
  - `PROGRAMS` or `getProgram`.
  - `generateWorkoutSchedule`.
  - Program types needed by the client.
- Keep worker imports working by switching `apps/worker/src/routes/programs.ts` to the shared exports.
- Ensure the shared code has no Worker-only dependencies.

Client local-start tasks:

- Add a helper in `apps/expo/db/training-cache.ts` or a new `apps/expo/db/programs.ts`, for example `createLocalProgramCycleFromStartPayload(userId, payload)`.
- It should mirror the server's `POST /api/programs` logic:
  - Resolve program config by slug.
  - Convert chosen 1RMs to storage units before this helper receives them. `handleStartProgram` already does this.
  - Generate workouts with `programConfig.generateWorkouts(oneRMs)`.
  - Generate schedule with `generateWorkoutSchedule`.
  - Insert a complete `local_program_cycles` row with:
    - `id`
    - `userId`
    - `programSlug`
    - `name`
    - current and starting 1RMs
    - `currentWeek/currentSession` from first generated workout
    - `totalSessionsCompleted = 0`
    - `totalSessionsPlanned`
    - `status = 'active'`
    - `isComplete = false`
    - preferred schedule fields
    - `programStartAt`
    - `firstSessionAt`
    - `hydratedAt`
  - Insert every generated workout into `local_program_cycle_workouts` with stable local IDs, scheduled dates, and serialized `targetLifts`.
  - Use library IDs and names directly for local target lifts. Do not block on server exercise row IDs; `createLocalWorkoutFromProgramCycleWorkout` can already use `exercise.exerciseId ?? exercise.libraryId ?? accessoryId ?? name`.

- In `apps/expo/app/(app)/programs.tsx`:
  - Replace `tryOnlineOrEnqueue` for start-program with local-first behavior:
    - Generate `cycleId`.
    - Build payload.
    - Call local helper to create cycle and schedule.
    - Enqueue `start_program` immediately.
    - Optimistically update/refetch React Query from local cache.
    - Close modals and navigate to `/(app)/home?focusProgramId=${cycleId}`.
    - Trigger `void runTrainingSync(userId)` without awaiting.
  - Keep validation and user-facing errors for local generation failures.

Sync/reconcile tasks:

- In `apps/expo/lib/workout-sync.ts`:
  - Special-case `start_program` instead of sending through `handleGenericSync`.
  - After posting `/api/programs`, use the response and/or force hydration to reconcile local cycle and workout rows.
  - Because the client sends an ID and the server is idempotent for existing IDs, prefer keeping the same cycle ID.
  - Confirm whether server-generated `program_cycle_workouts.id` values need to replace local IDs. If yes:
    - Add a local mapping/reconciliation step, or
    - Change server `createProgramCycle` to accept client-provided workout IDs.
  - Prefer changing `createProgramCycle` to accept deterministic workout IDs from the client. This avoids remapping `cycleWorkoutId` references in local workouts and sync payloads.

Server tasks:

- In `packages/db/src/program/cycle.ts`:
  - Extend `CreateProgramCycleData.workouts` to optionally accept `id`.
  - Use provided workout IDs when inserting `programCycleWorkouts`; fall back to `generateId()`.

- In `apps/worker/src/routes/programs.ts`:
  - Include generated workout IDs in server response or return `getProgramCycleWithWorkouts` after create if the client needs immediate reconciliation.
  - Keep idempotency for client-provided cycle ID.

Tests:

- Add shared program generation tests proving worker and client helpers produce the same schedule for fixed inputs.
- Add `apps/expo` tests for local program start:
  - Creates local cycle and all cycle workouts.
  - Enqueues `start_program`.
  - Does not call network before returning.
  - Current program workout can be created from the local cycle immediately after start.

- Add worker tests:
  - `POST /api/programs` accepts client-provided cycle workout IDs if implemented.
  - Duplicate `id` remains idempotent.

Acceptance criteria:

- Start Program navigates from local data without waiting for D1.
- Home shows the active program and first/current workout immediately.
- Program schedule opens offline immediately after starting.
- Sync creates the authoritative D1 cycle and reconciles without duplicate cycles or broken cycle workout IDs.

### Phase 4: Server Write Path Cleanup

This can follow the user-facing fixes.

Tasks:

- In `apps/worker/src/routes/workouts.ts`, replace delete-all/reinsert-all inside `sync-complete` with diff/upsert logic if repeated sync payloads or retries show D1 write latency remains high.
- Keep `workoutSyncOperations` idempotency.
- Consider batching D1 operations with existing `chunkedInsert` and `batchParallel` where safe.
- Make `recomputeHomeSummary` incremental:
  - Weekly totals only need current week completed workouts.
  - Streak can be computed from distinct recent local dates, not raw 365-day workout rows every completion.
  - Home summary can be recomputed lazily on GET rather than on every write.

Acceptance criteria:

- D1 sync-complete latency is stable as workout history grows.
- Home summary remains correct after completion, app restart, and stale cache refresh.

## Design Rules For The Implementation

- D1 remains source of truth.
- SQLite is a local projection plus write-ahead queue.
- User actions should not wait for D1 unless the action cannot be represented locally.
- Every local-first mutation must:
  - Write local domain rows first.
  - Enqueue a sync item with an idempotency key or stable entity ID.
  - Update React Query from local data.
  - Fire background sync without awaiting it.
  - Reconcile from D1 later.
- Hydration must not overwrite dirty local rows. Existing dirty checks in `hydrateOfflineTrainingSnapshot` should be preserved and extended where needed.
- Prefer stable client-generated IDs for entities created offline.
- Treat local sync statuses as user-visible state: `local`, `pending`, `syncing`, `synced`, `failed`, `conflict`.

## Big Refactor Direction

The codebase already has useful batching primitives in `packages/db/src/utils/d1-batch.ts`:

- `batchParallel`
- `chunkArray`
- `chunkedQuery`
- `chunkedQueryMany`
- `chunkedInsert`

The refactor should build around these instead of adding more ad hoc batching helpers. The larger goal is to make training persistence a coherent subsystem with shared plans, consistent batching, and thin storage adapters.

### Proposed Architecture

Create a training persistence boundary with three layers:

1. Shared domain planners in `packages/db/src/training/*`
   - Pure TypeScript.
   - No Drizzle driver imports.
   - No Expo imports.
   - No Hono/Worker imports.
   - Responsible for program generation, schedule planning, workout completion totals, graph diffs, and program advancement decisions.

2. Storage adapters
   - Standardize on Drizzle for both storage targets.
   - `apps/expo/db/*` applies plans with `drizzle-orm/expo-sqlite`.
   - `apps/worker/src/*` or D1-specific shared helpers apply plans with `drizzle-orm/d1`.
   - Adapters own transactions, batching, retries, and driver-specific behavior.

3. Orchestration/UI/API layer
   - Expo hooks/screens handle React Query, navigation, loading states, sync queue, and background sync.
   - Worker routes handle auth, request validation, ownership checks, and HTTP responses.

This keeps the business logic DRY while still respecting that D1 and device SQLite do not behave the same operationally. Drizzle should be the single query-builder/ORM standard; the abstraction difference should be at the driver/adapter boundary, not in handwritten SQL scattered through the app.

### Drizzle Standard

Use Drizzle as the default persistence API everywhere:

- Worker D1:
  - Continue using `drizzle-orm/d1`.
  - Continue using shared schema from `packages/db/src/schema.ts`.
  - Use existing D1 helpers in `packages/db/src/utils/d1-batch.ts` for chunking and batching.

- Expo SQLite:
  - Continue using `drizzle-orm/expo-sqlite`.
  - Continue using local schema from `apps/expo/db/local-schema.ts`.
  - Prefer Drizzle query builders for local reads/writes.
  - Avoid introducing raw SQL for normal CRUD paths unless Drizzle cannot express the operation cleanly or performance measurements prove it is needed.

- Shared domain code:
  - Should not import a Drizzle driver.
  - May import shared row/input types if they are plain TypeScript-safe exports.
  - Should return plain write plans that Drizzle adapters apply.

Rules:

- No new ad hoc SQL strings in feature code.
- Raw SQL is acceptable for migrations, indexes, Drizzle `sql` expressions, and carefully measured edge cases.
- Keep D1 schema and local SQLite schema intentionally separate where they represent different projections, but keep naming and column semantics aligned.
- If a table exists in both D1 and local SQLite, add mapper functions rather than duplicating field transformations inline.
- If a route/helper starts accumulating many Drizzle statements, move them into a named repository/adapter function.

Suggested adapter naming:

- `apps/expo/db/training-repository.ts`
  - Local Drizzle adapter for workout/program plans.

- `apps/worker/src/repositories/training-repository.ts`
  - D1 Drizzle adapter for the same plan types.

- `packages/db/src/training/*`
  - Pure planners and mappers shared by both repositories.

Acceptance criteria:

- All new persistence work uses Drizzle unless explicitly justified.
- Shared planners are driver-free.
- D1 and Expo adapters use equivalent Drizzle repository functions for the same write plans.
- Field mapping between D1 rows, local rows, and domain objects is centralized.

### Drizzle D1 vs Expo SQLite Compatibility Workstream

Do not assume the two Drizzle drivers have identical capabilities just because both are SQLite dialects.

Current installed versions:

- `drizzle-orm@0.45.2`
- `expo-sqlite@~55.0.15`
- `wrangler@4.87.0`
- `@cloudflare/workers-types@4.20260501.1`

Observed from installed typings:

- `drizzle-orm/d1`
  - Uses async query execution.
  - Exposes `db.batch(...)`.
  - Exposes async `db.transaction(...)`.
  - Returns D1-specific run metadata.

- `drizzle-orm/expo-sqlite`
  - Uses sync query execution for Drizzle calls.
  - Does not expose the same Drizzle `db.batch(...)` API.
  - Exposes sync `db.transaction(...)`.
  - Underlying `expo-sqlite` has async transaction APIs, but Drizzle's Expo driver in this version is typed as sync.

Implication:

- We can standardize on Drizzle, but not on one identical repository implementation for D1 and Expo SQLite.
- Shared code should standardize business plans and row mapping.
- Adapters should standardize behavior while using different execution strategies:
  - D1 adapter: async Drizzle, `chunkedInsert`, `db.batch`, `db.transaction`.
  - Expo adapter: sync Drizzle inside a serialized/coalesced local write queue, plus explicit local transactions.

Compatibility matrix to create before the big refactor:

| Capability | D1 Drizzle | Expo SQLite Drizzle | Decision |
| --- | --- | --- | --- |
| Basic select/insert/update/delete | Verify | Verify | Safe if covered by adapter tests |
| `returning()` | Verify | Verify | Avoid in shared assumptions until tested |
| `onConflictDoUpdate` | Verify | Verify | Use only through adapter helpers |
| Multi-row insert | Verify with D1 param limits | Verify local performance | D1 uses `chunkedInsert`; Expo uses local chunks/write queue |
| `db.batch` | Available | Not available | D1-only optimization |
| `db.transaction` | Async | Sync | Adapter-owned only |
| Nested transactions | Verify behavior | Verify behavior | Avoid hidden nested transactions |
| `inArray` large lists | D1 param limited | Local limit/perf dependent | Use chunked query helpers |
| Date/timestamp mapping | Verify | Verify | Centralize mappers |
| Boolean integer mapping | Verify | Verify | Centralize mappers |
| JSON/text fields | Verify | Verify | Serialize explicitly in mappers |
| Raw `sql` fragments | Verify per usage | Verify per usage | Keep narrow and tested |

Spike tasks:

- Add a small compatibility test suite or script that runs the same Drizzle operations against:
  - Worker local D1/miniflare.
  - Expo/local SQLite test harness if available.
- Cover:
  - insert with provided ID
  - multi-row insert
  - upsert
  - update with `returning`
  - transaction rollback
  - nested transaction attempt or explicit prevention
  - large `inArray` query split into chunks
  - timestamp and boolean round trips
  - JSON text serialization round trip
- Document the result in `TODO_DB.md` or a follow-up `docs/db-compatibility.md`.

Adapter rules from the compatibility work:

- Do not put `returning()`, `db.batch`, or transaction semantics inside shared planners.
- If a repository method needs returned rows, adapters may do insert/update followed by select instead of relying on `returning()`.
- D1 adapters should use `chunkedInsert` for large inserts and should not copy local SQLite loops.
- Expo adapters should use a write queue and local chunks; they should not try to emulate D1 `db.batch`.
- Any Drizzle feature that fails on either driver must be hidden behind an adapter method with tests for both implementations.
- Prefer the lowest common SQL shape for behavior, then add D1-only performance optimizations inside D1 adapters.

### Standardize Write Plans

Introduce shared write-plan types that both adapters can consume:

- `ProgramStartPlan`
  - `cycle`
  - `cycleWorkouts`
  - `syncPayload`

- `ProgramAdvancePlan`
  - `cycleUpdate`
  - `completedCycleWorkoutUpdate`
  - `isCycleComplete`

- `WorkoutCompletionPlan`
  - `workoutUpdate`
  - `exerciseRows`
  - `setRows`
  - `totals`
  - `lastWorkoutUpdates`

- `WorkoutGraphDiffPlan`
  - `exerciseInserts`
  - `exerciseUpdates`
  - `exerciseDeletes`
  - `setInserts`
  - `setUpdates`
  - `setDeletes`

The adapters should apply these plans with the best database-specific mechanism available.

### Standardize D1 Batching

Use existing D1 helpers consistently:

- Use `chunkedInsert` for multi-row inserts into D1 tables.
- Use `chunkedQuery` / `chunkedQueryMany` for `IN (...)` reads that can exceed D1 parameter limits.
- Use `batchParallel` only for independent D1 reads/writes where ordering does not matter and concurrency is safe.
- Use `db.batch` for groups of prepared Drizzle statements that must be sent together but are not a full transaction.
- Use `db.transaction` only where correctness requires atomicity across multiple tables.

Refactor candidates:

- `apps/worker/src/routes/programs.ts`
  - Program creation already uses `batchParallel` for exercise resolution and `createProgramCycle` uses `chunkedInsert`.
  - Move the planning part out of the route and keep the route as validation/auth plus D1 adapter.

- `apps/worker/src/routes/workouts.ts`
  - `sync-complete` uses `chunkedInsert`, but still deletes/reinserts the full workout graph.
  - Once shared graph diff exists, use it to reduce D1 writes on retries or edits.

- `apps/worker/src/lib/program-helpers.ts`
  - Already uses `db.batch`.
  - Align its program advancement behavior with shared `ProgramAdvancePlan` so client and server advancement cannot diverge.

### Standardize SQLite Writes

Expo SQLite needs a matching local write strategy, but not by copying D1 batching APIs directly.

Tasks:

- Add a local serialized write queue, for example `apps/expo/db/write-queue.ts`.
  - One writer at a time.
  - Coalesces draft saves by workout ID.
  - Provides `enqueueLocalWrite(label, fn)` and `flushLocalWrites()`.

- Keep local transactions close to adapters:
  - `withLocalTransaction` can remain for now.
  - Add explicit transaction ownership so nested helpers do not start hidden nested transactions.
  - Consider `withLocalTransactionAsync` only after confirming Expo SQLite + Drizzle behavior on Android.

- Apply `WorkoutGraphDiffPlan` locally:
  - Use a single transaction for each coalesced draft write.
  - Insert/update/delete only changed rows.
  - Keep full replacement only for server snapshot hydration or hard reset cases.

### Refactor In Stages

Because this can be a big refactor, avoid doing everything in one risky patch.

Stage 1:

- Add shared planner modules and tests.
- Keep existing app behavior, but make Worker and Expo call shared planners where easy.

Stage 2:

- Swap workout completion to local-first UI behavior.
- Use shared completion and advancement planners.

Stage 3:

- Add local write queue and graph diff.
- Replace active draft full rewrites.

Stage 4:

- Move program generation/scheduling into shared package exports.
- Make program start local-first using the shared `ProgramStartPlan`.

Stage 5:

- Tighten D1 adapters around standard batching helpers.
- Reduce Worker delete/reinsert paths where metrics show value.

Acceptance criteria:

- Business rules for program start, program advancement, workout completion totals, and graph diffing are implemented once in shared package code.
- D1 routes and SQLite helpers apply the same plans.
- D1 write paths consistently use `chunkedInsert`, `chunkedQuery`, `batchParallel`, `db.batch`, or `db.transaction` according to documented rules.
- SQLite writes are serialized and coalesced where needed.
- No route/screen contains large blocks of domain write logic mixed with network/UI concerns.

## Files Most Likely To Change

Client:

- `apps/expo/app/(app)/programs.tsx`
- `apps/expo/hooks/useWorkoutSession.ts`
- `apps/expo/hooks/usePrograms.ts`
- `apps/expo/hooks/useProgramSchedule.ts`
- `apps/expo/hooks/useHomeSummary.ts`
- `apps/expo/lib/workout-sync.ts`
- `apps/expo/lib/offline-mutation.ts`
- `apps/expo/db/client.ts`
- `apps/expo/db/workouts.ts`
- `apps/expo/db/training-cache.ts`
- `apps/expo/db/sync-queue.ts`
- `apps/expo/db/local-schema.ts` only if new metadata/mapping columns are needed

Shared:

- `packages/db/src/client.ts`
- `packages/db/src/program/cycle.ts`
- `packages/db/src/program/types.ts`
- New or moved shared program generator files under `packages/db/src/programs/*`

Worker:

- `apps/worker/src/routes/programs.ts`
- `apps/worker/src/routes/workouts.ts`
- `apps/worker/src/api/home/summary.ts`
- `apps/worker/src/programs/*` after moving/shared re-export

Tests:

- `apps/expo/hooks/useWorkoutSession.test.ts`
- `apps/expo/lib/workout-sync.test.ts`
- `apps/expo/db/workouts.test.ts`
- `apps/expo/db/client.test.ts`
- New `apps/expo/db/training-cache.test.ts` if missing
- `apps/worker/src/routes/workouts` tests
- `apps/worker/src/routes/programs` tests
- Shared program generator/scheduler tests

## Suggested Implementation Order

1. Add timing logs and capture baseline.
2. Make workout completion local-only from the UI perspective.
3. Add local program advancement and tests.
4. Remove server home-summary recompute from completion response path.
5. Replace active draft full rewrites with incremental writes.
6. Move program generation/scheduler to shared code.
7. Make program start local-first with complete local cycle workout rows.
8. Improve start-program sync reconciliation.
9. Optimize Worker sync-complete writes only if metrics still show server latency as a bottleneck.

## Done Definition

- Starting a program, logging an active workout, and finishing a workout all work in airplane mode after initial cache hydration.
- Starting a program and finishing a workout return control to the user from local SQLite work, not from D1 response time.
- Active set edits no longer trigger full exercise/set graph rewrites.
- D1 receives queued writes when online and remains the authoritative reconciled state.
- Dirty local rows are not overwritten by background hydration.
- Tests cover local-first success, offline queueing, sync success, sync failure/conflict, and idempotent retry.
- `bun run check` and `bun run test` pass.

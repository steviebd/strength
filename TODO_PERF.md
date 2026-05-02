# Performance Improvement Plan — SQLite Writes & D1 Batch Limits

## Background

Local SQLite in the Expo app uses Drizzle ORM over `expo-sqlite`'s **synchronous** driver. Every `.run()` / `.all()` / `.get()` is a separate auto-committed statement. On D1 (Cloudflare Worker), we use `db.batch()` via `chunkedInsert` in `packages/db/src/utils/d1-batch.ts`.

The current code has two classes of problems:

1. **Local SQLite:** Multi-row writes happen as dozens/hundreds of individual fsyncs (no transactions).
2. **D1 (Free tier):** `chunkedInsert` can blow past the 50-query-per-invocation limit for large operations, and `homeSummaryHandler` fires 8+ sequential queries that are mostly independent.

---

## Goals

1. Wrap local SQLite hotspots in `withTransactionSync`.
2. Add missing local and D1 indexes for high-traffic reads.
3. Parallelize independent reads in D1 handlers.
4. Audit large D1 write paths for free-tier safety.
5. Measure Android artifact and JS bundle size, then optimize the largest contributors.

---

## 1. Local Transaction Helper First, `bulkWrite` Later

### Recommendation
Do **not** start with a generic cross-driver `bulkWrite` abstraction. The current local hotspots need a mix of:

- `onConflictDoUpdate`
- delete-then-insert replacement
- local Expo SQLite transaction access
- D1 `db.batch()` chunking
- caller-specific rollback expectations

A generic API that only accepts `{ table, rows }` would either be too weak for the current call sites or would quickly grow into a complex abstraction before the concrete performance fixes are proven.

### Phase 1 Scope
Create a small Expo-local helper instead:

```ts
export function withLocalTransaction<T>(fn: () => T): T
```

The helper should expose the underlying `expo-sqlite` connection or live next to the local DB client so callers can use `sqlite.withTransactionSync`. Keep the Drizzle client API unchanged.

### Later `bulkWrite` Extraction
After the concrete transaction wrappers are implemented and measured, revisit a shared helper with explicit support for:

- `onConflictDoUpdate` / `onConflictDoNothing`
- delete/replace steps inside the same local transaction
- D1 `maxStatementsPerBatch`
- caller-visible partial write reporting
- an explicit statement that D1 batches are not atomic

### Acceptance
- [x] `withLocalTransaction` compiles and has a unit test or mock test proving the callback is wrapped.
- [x] `chunkArray` / `getSafeInsertChunkSize` stay in `@strength/db` for D1 chunking.
- [x] `bulkWrite` remains a later extraction, not a blocker for the first SQLite wins.

---

## 2. Local SQLite Hotspots — Add Transactions & Indexes

### 2a. `replaceLocalExercises` (`apps/expo/db/workouts.ts:143`)

**Current behavior:** For a 10-exercise workout with 5 sets each:
- 1 `DELETE` for sets
- 1 `DELETE` for exercises
- 10 `INSERT`s for exercises
- 50 `INSERT`s for sets
= **62 auto-committed writes**

**Fix:** Wrap the entire function body in `sqlite.withTransactionSync(() => { ... })`.

**Async note:** Keep the function signature async because callers already `await` it, but do **not** wrap `withTransactionSync` in a manual `new Promise`. `withTransactionSync` is synchronous; an `async function` that runs it and returns normally is still awaitable and preserves ordering.

**Related parent write:** `saveLocalWorkoutDraft` updates the parent `local_workouts` row immediately before calling `replaceLocalExercises`. If practical, wrap the parent update and exercise replacement in the same transaction so draft state cannot be partially updated.

- [x] `replaceLocalExercises` wrapped in `withTransactionSync`.
- [x] `saveLocalWorkoutDraft` either uses one transaction for the workout update + exercise replacement, or documents why the parent update remains outside.
- [x] Verified that `createLocalWorkout` and `updateLocalWorkout` still behave correctly.

### 2b. `hydrateOfflineTrainingSnapshot` (`apps/expo/db/training-cache.ts:50`)

**Current behavior:** Loops over every template, exercise, cycle, and workout doing individual `.run()` calls. For a user with 50 templates + program data, this is **hundreds of individual fsyncs**.

**Fix:**
1. Collect all rows into arrays first.
2. Use targeted local transaction wrappers for templates, template exercises, user exercises, program cycles, and cycle workouts. Do not block this on a generic `bulkWrite` API.
3. For the "delete orphaned" steps (templates/cycles no longer on server), do a single `SELECT` to get all existing IDs, compute the diff in JS, then a single `DELETE ... WHERE id IN (...)` or `UPDATE ... SET is_deleted = 1`.

**Important:** `hydrateOfflineTrainingSnapshot` is async and calls `upsertServerWorkoutSnapshot` for each recent workout. With `recentWorkoutLimit=50`, this can be the largest local write path because every server workout can call `replaceLocalExercises`. Those should either:

- stay outside the main training-cache transaction but get their own transaction via `replaceLocalExercises`; or
- be batched in a separate recent-workout hydration transaction that skips dirty local workouts.

- [x] `hydrateOfflineTrainingSnapshot` wraps template/user-exercise/cycle/cache-meta writes in local transactions.
- [x] Orphan-cleanup changed from N individual updates to one batched `UPDATE`/`DELETE`.
- [ ] Recent workout hydration is measured and either stays separate with transactional `replaceLocalExercises` or gets its own batch wrapper.

### 2c. `runLocalMigrations` (`apps/expo/db/migrations.ts`)

**Current behavior:** Each `addColumnIfMissing` does a separate `PRAGMA table_info()` + `ALTER TABLE`. The versioned migration block does 20+ of these sequentially.

**Fix:** Wrap the versioned migration callback in `sqlite.withTransactionSync`. The base `CREATE TABLE` / `CREATE INDEX` block at the top can stay as one big `execSync` (it already is).

- [x] `applyVersionedMigration` wraps its callback in `withTransactionSync`.
- [ ] Tested on a fresh install and on an existing database.

### 2d. Missing Composite Index on `local_workout_sets`

**Current:** `_workoutSetsWorkoutExerciseIdIdx` is on `(workoutExerciseId)` only. Queries that also filter by `isDeleted` (common in local workout loading and history lookups in `apps/expo/db/workouts.ts`) can't use a covering index.

**Fix:** Add a composite index on `(workoutExerciseId, isDeleted, setNumber)`. The common reads filter by `workout_exercise_id`, filter `is_deleted = 0`, and order by `set_number`.

- [x] Add index to local migrations: `CREATE INDEX IF NOT EXISTS idx_local_workout_sets_exercise_deleted_order ON local_workout_sets (workout_exercise_id, is_deleted, set_number)`.
- [x] Add the same index to the base `CREATE INDEX` block for fresh installs.

### 2e. Missing Runnable Sync Queue Index

**Current:** `getRunnableSyncItems` filters by `userId`, `status`, and `availableAt`, but the current local index is only `(status, available_at)`.

**Fix:** Add a composite index for the exact polling pattern:

```sql
CREATE INDEX IF NOT EXISTS idx_local_sync_queue_user_runnable
  ON local_sync_queue (user_id, status, available_at);
```

- [x] Add index to fresh-install migration block.
- [x] Add index to a versioned migration for existing installs.

### 2f. Local `lower(name)` Lookup

**Current:** `getRecentExerciseHistory` uses `lower(local_workout_exercises.name)` for fallback matching. That expression cannot use the existing workout/order index.

**Fix options:**
- Add a normalized-name column maintained on local writes.
- Or add an expression index on `lower(name)` if Expo SQLite supports it reliably across target Android versions.

- [x] Choose normalized column vs expression index.
- [x] Add migration for the chosen expression index (no local write changes needed).

### 2g. Draft Save Debounce is a Red Herring

**Current:** `useWorkoutSession.ts:289` debounces draft saves at 400ms. The save calls `saveLocalWorkoutDraft` which calls `replaceLocalExercises` (full delete+reinsert). While the debounce could be adjusted, the real fix is **transaction wrapping** (item 2a). Once `replaceLocalExercises` is wrapped in `withTransactionSync`, the 400ms debounce is likely adequate. Further tuning should be based on measurement because increasing the delay raises crash/data-loss risk.

- [ ] Measure draft-save duration before/after transaction wrapping.
- [ ] Defer debounce tuning until after transaction wrapping is verified. If still slow, evaluate 500-800ms with explicit UX/data-loss tradeoff.

---

## 3. D1 Read Parallelization

### 3a. `homeSummaryHandler` (`apps/worker/src/api/home/summary.ts`)

**Current behavior:** 8+ sequential queries:
1. `resolveUserTimezone`
2. `activeCycles`
3. `cycleWorkouts` (conditional)
4. `weekCompletedWorkouts`
5. `scheduledInWeek` (conditional)
6. `recentWorkouts` (conditional)
7. `whoopRecovery`
8. `whoopCycle`
9. `whoopSleep`
10. `whoopProfile`
11. `getLatestOneRMsForUser`

**Fix:** Many of these are independent. Group them into parallel batches:

- **Batch 1:** `resolveUserTimezone` + `activeCycles` (timezone is needed for everything else, but activeCycles is independent).
- **Batch 2:** `weekCompletedWorkouts` + `whoopRecovery` + `whoopCycle` + `whoopSleep` + `whoopProfile` + `getLatestOneRMsForUser` (all independent once userId and date range are known).
- `cycleWorkouts` depends on `activeCycle`, so it stays after Batch 1.
- `scheduledInWeek` can likely be removed entirely because `cycleWorkouts` has already loaded every workout for the active cycle; compute this count in memory from `cycleWorkouts` instead of issuing another query.
- `recentWorkouts` depends on `hasActiveProgram`, so it stays conditional.

- [x] `homeSummaryHandler` parallelizes independent queries.
- [x] `homeSummaryHandler` derives `workoutsTarget` from already-loaded `cycleWorkouts` where possible.
- [x] Existing tests in `home/summary.test.ts` still pass.

### 3b. Audit other D1 handlers

Look for similar patterns in:
- `apps/worker/src/routes/workouts.ts`
- `apps/worker/src/routes/templates.ts`
- `apps/worker/src/routes/program-cycles.ts`
- `apps/worker/src/api/nutrition/`

Any handler that fires 3+ independent sequential queries is a candidate.

#### Nutrition API audit results (investigated)

**`entries.ts`** — 2 queries per request (timezone + select or insert). No issues.

**`entries.$id.ts`** — 1-2 queries per request. No issues.

**`body-stats.ts`** — 1-2 queries per request. No issues.

**`training-context.ts`** — 1-2 queries per request. No issues.

**`daily-summary.ts` (`dailySummaryHandler`)** — 5 sequential queries:
1. `resolveUserTimezone`
2. `entries` selection
3. `bodyStats` selection
4. `trainingContext` selection
5. `whoopData`
After `resolveUserTimezone`, steps 2, 3, and 4 are fully independent and should run in `Promise.all`.

**`chat.ts` (`generateNutritionChatAssistantContent`)** — 7 sequential queries after `resolveChatDate`:
1. `resolveChatDate` (includes `resolveUserTimezone`)
2. `userPreferences`
3. `bodyStats`
4. `activeProgram`
5. `nutritionEntries` (depends on `startOfDay`/`endOfDay`)
6. `trainingContext` (depends on `startOfDay`/`endOfDay`)
7. `whoopData` (depends on `date`/`timezone`)
After `resolveChatDate`, steps 2-7 are all independent of each other and should run in `Promise.all`.

**No bulk-insert patterns** were found in the nutrition handlers — all writes are single-row inserts/updates.

- [ ] List of handlers audited and tickets filed for any offenders.
- [x] Nutrition API audited — `dailySummaryHandler` (5 sequential → parallelize 3) and `generateNutritionChatAssistantContent` (7 sequential → parallelize 6) are candidates. No bulk-write issues found.

### 3c. `lower(name)` Fallback Query (`apps/worker/src/routes/workouts.ts:903`)

**Current:** The `/last/:exerciseId` handler falls back to:
```ts
sql`lower(${schema.exercises.name}) = ${exerciseName.toLowerCase()}`
```
This cannot use `idx_exercises_user_id_updated_at` (the only index on `exercises`) because a `lower()` function call defeats column index usage.

**Fix:** Add a composite expression index or generated/normalized column. A standalone `lower(name)` index is weaker than needed because the query also filters by `userId` and `isDeleted`.

Raw migration option:

```sql
CREATE INDEX idx_exercises_user_deleted_lower_name
  ON exercises (user_id, is_deleted, lower(name));
```

Drizzle schema support for expression indexes may be limited. If the schema DSL cannot express this cleanly, add a raw migration and a migration guardrail test.

Generated/normalized column option:

```ts
nameNormalized: text('name_normalized')
```

Also consider querying by `libraryId` first since library exercises have deterministic IDs.

- [x] Add composite `(user_id, is_deleted, lower(name))` index or normalized column.
- [x] Add migration guardrail test for the chosen index.
- [ ] Or refactor `/last/:exerciseId` to query by `libraryId` before the text fallback.

### 3d. `chunkedQueryMany` Overhead on Small Lists

**Current:** `chunkedQueryMany` splits IDs into chunks of 100 with concurrency 4. For typical template lists (<50 exercises), this adds unnecessary batching overhead. Consider increasing chunk size to 500 where param limits allow, or use a direct `where inArray(...)` for small lists.

- [ ] Evaluate chunk size for known-small query paths (template exercises, cycle workouts).

---

## 4. D1 Free-Tier Safety Audit

### Context
Free tier = **50 queries per Worker invocation**. `chunkedInsert` currently uses `DEFAULT_STATEMENTS_PER_BATCH = 95`, which is fine for Paid (1,000) but dangerous on Free if the caller doesn't know the tier.

Important nuance: lowering `DEFAULT_STATEMENTS_PER_BATCH` to 45 only caps a single `db.batch()` call. It does **not** guarantee the whole Worker invocation stays below 50 SQL statements if a handler performs other reads/writes before or after `chunkedInsert`, or if `chunkedInsert` needs multiple batches.

### What to check
1. **Template copying / bulk creation:** If a user copies a program with 500+ template exercises, how many `chunkedInsert` calls does that trigger?
2. **Workout history sync:** Large `chunkedInsert` of past workouts.
3. **Does `chunkedInsert` warn or split across multiple invocations?** It doesn't today — it just batches up to 95 statements at a time.

### Fix options
- Option A: Lower `DEFAULT_STATEMENTS_PER_BATCH` to 45 on Free tier. This reduces blast radius but does not solve per-invocation query limits by itself.
- Option B: Make `chunkedInsert` accept a `maxStatementsPerBatch` parameter and have callers that might exceed 50 pass an explicit cap.
- Option C: Add per-handler write budgets and hard input limits so a request cannot exceed the remaining D1 query budget.
- Option D: Split large writes across multiple client requests or queue/background jobs.
- Option E: Document the limit and trust that large writes are rare enough.

**Recommendation:** Combine B + C. Add an optional `maxStatementsPerBatch` to `chunkedInsert` and set the default to 45, but also audit each handler's total query budget. Large callers on Paid can opt up only after the handler has an explicit budget and tests.

- [x] `chunkedInsert` accepts `maxStatementsPerBatch` and defaults to 45.
- [ ] Audit all `chunkedInsert` callers for total per-invocation query count, not just batch size.
- [x] Add input limits or split requests where one request can exceed the D1 free-tier query cap.
- [x] Add tests around chunking and statement-budget behavior.

---

## 4b. Error Handling & Rollback Strategy

Currently, there is no explicit error-handling or rollback plan for future `bulkWrite` or current `chunkedInsert` failures.

### Local SQLite
`withTransactionSync` provides atomic rollback on failure — if any statement in the transaction fails, the entire chunk is rolled back. This is sufficient as long as the transaction wrapper is used correctly.

### D1 (`db.batch()`)
`db.batch()` is not atomic — a partial failure could leave some statements committed and others not. Mitigations:

- **Small chunks help:** With a low `maxStatementsPerBatch` (e.g., 45), the blast radius of a partial failure is limited.
- **Callers should handle partial results:** If `chunkedInsert` returns fewer rows than expected, the caller should detect the mismatch and either retry the remaining rows or surface an error.
- **Logging:** `chunkedInsert` should log chunk-level results for large operations so partial failures are traceable.

### Acceptance
- [x] `chunkedInsert` logs chunk-level results for multi-batch writes.
- [ ] D1 callers that rely on atomicity (e.g., "clear then insert") document that a partial failure could leave the table in an inconsistent state, and suggest a compensating action (re-run the full operation).
- [ ] If `bulkWrite` is added later, consider an explicit `atomic: boolean` flag for local SQLite only. D1 should not promise atomic behavior unless implemented with a strategy that is known to be safe for D1 limits.

---

## 5. Android Build Optimizations

### 5a. Asset Compression (4.5MB of PNGs)

**Current asset sizes (`apps/expo/assets/`):**

| File | Size |
|------|------|
| splash.png | 1.3MB |
| logo-horizontal.png | 1.2MB |
| icon.png | 1.1MB |
| adaptive-icon.png | 944KB |
| favicon.png | 5.1KB |

These are bundled raw and contribute directly to APK size. Expo also auto-generates density variants, multiplying the impact.

**Fix:** Convert to WebP or aggressively optimize PNGs with `pngquant`/`oxipng`.

```bash
# WebP conversion
cwebp -q 80 assets/splash.png -o assets/splash.webp
# Or lossy PNG
pngquant --quality 60-80 assets/splash.png --output assets/splash-opt.png
```

- [x] Convert splash, icon, logo-horizontal, and adaptive-icon to WebP or optimized PNG.
- [ ] Update `app.json` asset paths if changing extensions.
- [ ] Target: <200KB per asset (currently ~1.2MB avg).

Current lossless PNG optimization baseline after metadata stripping:

| File | Size |
|------|------|
| splash.png | 1.10MB |
| logo-horizontal.png | 1.02MB |
| icon.png | 1020KB |
| adaptive-icon.png | 851KB |
| favicon.png | 5.06KB |
| Total | 3.96MB |

### 5b. Confirm Hermes JS Engine

**Current:** `app.json` has no `jsEngine` field. Current Expo documentation says Hermes is already the default JavaScript engine, so this is not a guaranteed size/startup win. Adding `"jsEngine": "hermes"` can still be useful as explicit documentation/lock-in.

**Fix:** Optionally add to `apps/expo/app.json`:
```json
"android": {
  "jsEngine": "hermes"
}
```

- [ ] Verify current release builds are using Hermes before claiming a size/startup improvement.
- [x] Optionally add `"jsEngine": "hermes"` to `app.json` under `expo.android` for explicitness.
- [ ] Test release build on physical device.

### 5c. Enable ProGuard/R8 Code Shrinking

**Current:** Production EAS config (`eas.json`) has no `enableProguardInReleaseBuilds`.

**Fix:** Add to `eas.json`:
```json
"production": {
  "android": {
    "buildType": "app-bundle",
    "enableProguardInReleaseBuilds": true
  }
}
```

- [x] Add `"enableProguardInReleaseBuilds": true` to production build profile.
- [ ] Add ProGuard rules file if any dependencies need keep rules (Reanimated, Worklets).

### 5d. Dependency Audit


**`expo-image-manipulator` + `expo-image-picker`** — Used only for nutrition chat image uploads. Dynamic JS imports may reduce startup evaluation work, but they generally will **not** remove native module code from the Android binary while the packages remain installed.

- [ ] Audit `@better-auth` imports for server-side code leaking into mobile bundle.
- [ ] Measure JS bundle contribution from nutrition image capture before lazy-loading it.
- [ ] Consider moving image capture behind a lazily loaded route/component for JS startup only.
- [ ] If Android binary size is the priority, evaluate whether native image modules can be removed or replaced, not just dynamically imported.

### 5e. Bundle Analysis

Add a bundle analyzer to CI to catch regressions:
```bash
npx react-native-bundle-visualizer
```

- [ ] Add bundle analysis script to `package.json`.
- [ ] Consider CI check that warns on bundle size increases >5%.

### 5f. Artifact Size Baseline

Before changing assets or build flags, record:

- production `.aab` size
- production `.apk` size
- Expo export JS bundle size
- asset directory size

- [x] Add a repeatable size-report script or documented commands.
- [x] Record baseline sizes in this file or in a generated artifact.

---

## 6. Testing Plan

- [x] Unit tests or mock tests for `withLocalTransaction` and transaction-wrapped local write helpers.
- [x] Unit tests for `chunkedInsert` `maxStatementsPerBatch` behavior.
- [x] Unit tests for transaction wrapping in `apps/expo/db` using an in-memory SQLite DB if possible, or mocked `withTransactionSync`.
- [ ] Performance baseline before/after for draft save on a 10-exercise x 5-set workout.
- [ ] Performance baseline before/after for `hydrateOfflineTrainingSnapshot` with 50 recent workouts.
- [ ] D1 query-count or statement-budget test for high-risk write handlers.
- [x] Android size baseline before/after asset/build changes.
- [x] Run `bun run check` and `bun run test` before each PR.
- [ ] Manual smoke test on Android: create a workout from a template, complete it, check that local DB still reads correctly.
- [ ] Manual smoke test on web/D1: load home summary, verify no 500s from query limit exhaustion.

---

## 7. Order of Implementation

1. **Phase 0:** Capture baselines: local draft-save timing, offline hydration timing, D1 query counts for hot handlers, Android `.apk`/`.aab` size, and JS bundle size.
2. **Phase 1:** Add `withLocalTransaction`, wrap `replaceLocalExercises`, wrap draft parent-update + exercise replacement where practical, wrap recent workout snapshot writes via `replaceLocalExercises`, and wrap versioned local migrations.
3. **Phase 2:** Add local indexes: `local_workout_sets(workout_exercise_id, is_deleted, set_number)`, `local_sync_queue(user_id, status, available_at)`, and normalized/expression support for local `lower(name)` history lookup.
4. **Phase 3:** Parallelize D1 reads in `homeSummaryHandler`, `dailySummaryHandler`, and `generateNutritionChatAssistantContent`; remove redundant `scheduledInWeek` query in home summary; audit other handlers.
5. **Phase 4:** Add D1 composite expression/normalized-name index for exercise fallback lookup. Evaluate `chunkedQueryMany` chunk sizes only where measurement shows overhead.
6. **Phase 5:** Add `maxStatementsPerBatch` to `chunkedInsert`, set default to 45, and add handler-level D1 query budgets/input limits for large writes.
7. **Phase 6:** Android build optimizations: compress assets first, confirm Hermes instead of assuming it is missing, evaluate ProGuard/R8, and audit dependency contributions with measurement.
8. **Phase 7:** Re-run full test suite, compare performance/size baselines, and do Android/web smoke tests.

---

## 8. Open Questions

- Should `bulkWrite` exist at all after targeted transaction wrappers, or is a smaller set of local helpers plus D1 `chunkedInsert` enough?
- If `bulkWrite` is added later, should it support `onConflictDoUpdate` / `onConflictDoNothing` for local SQLite? The current hotspots use `.onConflictDoUpdate` on some tables. If yes, the API might need operation-specific conflict config rather than a single `conflictStrategy`.
- For `hydrateOfflineTrainingSnapshot`, should the entire function be one giant transaction, or multiple smaller ones (one per entity type plus one for recent workouts)? A giant transaction is simpler but holds the lock longer.
- Should we add a performance benchmark (e.g., time `hydrateOfflineTrainingSnapshot` before/after) to verify the improvement?
- Can D1 query counts be captured in tests with a lightweight DB wrapper, so the free-tier budget is enforced automatically?

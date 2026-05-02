# Performance Improvement Plan — SQLite Writes & D1 Batch Limits

## Background

Local SQLite in the Expo app uses Drizzle ORM over `expo-sqlite`'s **synchronous** driver. Every `.run()` / `.all()` / `.get()` is a separate auto-committed statement. On D1 (Cloudflare Worker), we use `db.batch()` via `chunkedInsert` in `packages/db/src/utils/d1-batch.ts`.

The current code has two classes of problems:

1. **Local SQLite:** Multi-row writes happen as dozens/hundreds of individual fsyncs (no transactions).
2. **D1 (Free tier):** `chunkedInsert` can blow past the 50-query-per-invocation limit for large operations, and `homeSummaryHandler` fires 8+ sequential queries that are mostly independent.

---

## Goals

1. Build a **shared `bulkWrite` abstraction** in `@strength/db` that works for both D1 and local SQLite.
2. Wrap local SQLite hotspots in `withTransactionSync`.
3. Parallelize independent reads in D1 handlers.
4. Audit large D1 write paths for free-tier safety.

---

## 1. Shared `bulkWrite` Abstraction

### Where
`packages/db/src/utils/bulk-writer.ts` (new file)

### What
Export a unified helper with two driver-specific paths:

```ts
export async function bulkWrite<T extends AnySQLiteTable>(
  db: D1Database | SQLiteDatabase,
  operations: Array<{ table: T; rows: T['$inferInsert'][] }>,
  options?: { chunkSize?: number; maxQueryParams?: number },
): Promise<number>
```

- **D1 path:** Reuses existing `chunkedInsert` → `db.batch()` logic.
- **Local path:** Reuses `chunkArray` / `getSafeInsertChunkSize`, but wraps each chunk in `sqlite.withTransactionSync(() => { ... })`.

### Notes
- `chunkArray` and `getSafeInsertChunkSize` from `d1-batch.ts` are pure math and can be imported directly.
- For local SQLite, use `withTransactionSync` (not async) because the Drizzle driver is sync and the JS thread block is acceptable for <100ms writes.
- Consider adding a `deleteWhere` / `deleteMany` pre-step so callers can do "clear then insert" atomically.

### Acceptance
- [ ] `bulkWrite` compiles and has unit tests for both chunking math and transaction wrapping.
- [ ] Existing `chunkedInsert` continues to work (import shared logic, don't duplicate).

---

## 2. Local SQLite Hotspots — Add Transactions

### 2a. `replaceLocalExercises` (`apps/expo/db/workouts.ts:143`)

**Current behavior:** For a 10-exercise workout with 5 sets each:
- 1 `DELETE` for sets
- 1 `DELETE` for exercises
- 10 `INSERT`s for exercises
- 50 `INSERT`s for sets
= **62 auto-committed writes**

**Fix:** Wrap the entire function body in `sqlite.withTransactionSync(() => { ... })`.

**Edge case:** `replaceLocalExercises` is async (returns `Promise<void>`) but only because of the function signature. The body is fully synchronous. If callers currently `await` it, making it sync and fire-and-forget could cause race conditions where dependent reads see stale data. **Fix:** Keep it async and wrap the transaction body in `new Promise<void>(resolve => { withTransactionSync(...); resolve(); })` so callers can still await completion.

- [ ] `replaceLocalExercises` wrapped in `withTransactionSync`.
- [ ] Verified that `createLocalWorkout` and `updateLocalWorkout` still behave correctly.

### 2b. `hydrateOfflineTrainingSnapshot` (`apps/expo/db/training-cache.ts:50`)

**Current behavior:** Loops over every template, exercise, cycle, and workout doing individual `.run()` calls. For a user with 50 templates + program data, this is **hundreds of individual fsyncs**.

**Fix:**
1. Collect all rows into arrays first.
2. Use `bulkWrite` (local path) to insert in chunked transactions.
3. For the "delete orphaned" steps (templates/cycles no longer on server), do a single `SELECT` to get all existing IDs, compute the diff in JS, then a single `DELETE ... WHERE id IN (...)` or `UPDATE ... SET is_deleted = 1`.

**Important:** `hydrateOfflineTrainingSnapshot` is async and calls `upsertServerWorkoutSnapshot` for each recent workout. Those should stay outside the main transaction (they have their own logic), or we should batch them too.

- [ ] `hydrateOfflineTrainingSnapshot` uses `bulkWrite` for templates, template exercises, user exercises, program cycles, and cycle workouts.
- [ ] Orphan-cleanup changed from N individual updates to one batched `UPDATE`/`DELETE`.
- [ ] `upsertServerWorkoutSnapshot` for recent workouts either stays separate or gets its own transaction wrapper.

### 2c. `runLocalMigrations` (`apps/expo/db/migrations.ts`)

**Current behavior:** Each `addColumnIfMissing` does a separate `PRAGMA table_info()` + `ALTER TABLE`. The versioned migration block does 20+ of these sequentially.

**Fix:** Wrap the versioned migration callback in `sqlite.withTransactionSync`. The base `CREATE TABLE` / `CREATE INDEX` block at the top can stay as one big `execSync` (it already is).

- [ ] `applyVersionedMigration` wraps its callback in `withTransactionSync`.
- [ ] Tested on a fresh install and on an existing database.

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
- `cycleWorkouts` and `scheduledInWeek` depend on `activeCycle`, so they stay sequential after Batch 1.
- `recentWorkouts` depends on `hasActiveProgram`, so it stays conditional.

- [ ] `homeSummaryHandler` parallelizes independent queries.
- [ ] Existing tests in `home/summary.test.ts` still pass.

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

---

## 4. D1 Free-Tier Safety Audit

### Context
Free tier = **50 queries per Worker invocation**. `chunkedInsert` currently uses `DEFAULT_STATEMENTS_PER_BATCH = 95`, which is fine for Paid (1,000) but dangerous on Free if the caller doesn't know the tier.

### What to check
1. **Template copying / bulk creation:** If a user copies a program with 500+ template exercises, how many `chunkedInsert` calls does that trigger?
2. **Workout history sync:** Large `chunkedInsert` of past workouts.
3. **Does `chunkedInsert` warn or split across multiple invocations?** It doesn't today — it just batches up to 95 statements at a time.

### Fix options
- Option A: Lower `DEFAULT_STATEMENTS_PER_BATCH` to 45 on Free tier.
- Option B: Make `chunkedInsert` accept a `maxStatementsPerBatch` parameter and have callers that might exceed 50 pass an explicit cap.
- Option C: Document the limit and trust that large writes are rare enough.

**Recommendation:** Option B. Add an optional `maxStatementsPerBatch` to `chunkedInsert` and `bulkWrite`. **Set the default to 45** so it's safe on Free tier by default — "opt-in safety" is inherently unsafe since callers won't know their tier. Large callers on Paid can opt up if needed, but the common case must not blow past 50.

- [ ] `chunkedInsert` and `bulkWrite` accept `maxStatementsPerBatch`.
- [ ] Audit callers in `apps/worker/src/api/` for large write paths.

---

## 4b. Error Handling & Rollback Strategy

Currently, there is no explicit error-handling or rollback plan for `bulkWrite` or `chunkedInsert` failures.

### Local SQLite
`withTransactionSync` provides atomic rollback on failure — if any statement in the transaction fails, the entire chunk is rolled back. This is sufficient as long as the transaction wrapper is used correctly.

### D1 (`db.batch()`)
`db.batch()` is not atomic — a partial failure could leave some statements committed and others not. Mitigations:

- **Small chunks help:** With a low `maxStatementsPerBatch` (e.g., 45), the blast radius of a partial failure is limited.
- **Callers should handle partial results:** If `bulkWrite` returns fewer rows than expected, the caller should detect the mismatch and either retry the remaining rows or surface an error.
- **Logging:** `bulkWrite` should log chunk-level results so partial failures are traceable.

### Acceptance
- [ ] `bulkWrite` logs chunk-level results (rows written per chunk).
- [ ] D1 callers that rely on atomicity (e.g., "clear then insert") document that a partial failure could leave the table in an inconsistent state, and suggest a compensating action (re-run the full operation).
- [ ] Consider adding an optional `atomic: boolean` flag to `bulkWrite` for callers that need strict all-or-nothing behavior (accepted risk: may exceed D1 query limits if chunks are large).

---

## 5. Testing Plan

- [ ] Unit tests for `bulkWrite` (both D1 and local paths) in `packages/db`.
- [ ] Unit tests for transaction wrapping in `apps/expo/db` using an in-memory SQLite DB if possible, or mocked `withTransactionSync`.
- [ ] Run `bun run check --fix` and `bun run test` before each PR.
- [ ] Manual smoke test on Android: create a workout from a template, complete it, check that local DB still reads correctly.
- [ ] Manual smoke test on web/D1: load home summary, verify no 500s from query limit exhaustion.

---

## Order of Implementation

1. **Phase 1:** Extract shared chunking logic and build `bulkWrite` in `@strength/db`.
2. **Phase 2:** Wrap local hotspots (`replaceLocalExercises`, `hydrateOfflineTrainingSnapshot`, migrations) in transactions.
3. **Phase 3:** Parallelize D1 reads in `homeSummaryHandler` and audit other handlers.
4. **Phase 4:** Add `maxStatementsPerBatch` parameter and audit large D1 write paths.
5. **Phase 5:** Run full test suite and manual smoke tests.

---

## Open Questions

- Should `bulkWrite` support `onConflictDoUpdate` / `onConflictDoNothing` for local SQLite? The current hotspots use `.onConflictDoUpdate` on some tables. If yes, the API might need a third field per operation: `conflictStrategy: 'replace' | 'ignore' | 'error'`.
- For `hydrateOfflineTrainingSnapshot`, should the entire function be one giant transaction, or multiple smaller ones (one per entity type)? A giant transaction is simpler but holds the lock longer. Given the data size (<1,000 rows), one transaction is fine.
- Should we add a performance benchmark (e.g., time `hydrateOfflineTrainingSnapshot` before/after) to verify the improvement?

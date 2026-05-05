# Database Operations Improvements Plan

## Overview

6 items to reduce complexity and speed up D1/local SQLite performance. Order is priority-weighted (critical → nice-to-have). Items are self-contained but can interact; see Dependencies section at bottom.

---

## 1. Fix Rate Limit Race Condition

**Priority:** Critical  
**File:** `apps/worker/src/lib/rate-limit.ts`  
**Effort:** Small (changes to ~10 lines)

### Problem

The current pattern is **read-then-write**, which has a classic race:

```
Request A: SELECT requests=5 → OK → UPDATE requests=6
Request B: SELECT requests=5 → OK → UPDATE requests=6
Result:    Only 6 requests counted instead of 7
```

Two concurrent requests both read `requests=5` before either writes, so both pass the limit check and both write 6.

### Fix

Replace the read-then-write increment at lines 66-73:

```typescript
// BEFORE (race-prone)
await db
  .update(schema.rateLimit)
  .set({
    requests: existing.requests + 1,
    updatedAt: new Date(now),
  })
  .where(eq(schema.rateLimit.id, existing.id))
  .run();

return { allowed: true, remaining: limitPerHour - (existing.requests + 1) };
```

With an atomic update that checks the limit server-side:

```typescript
// AFTER (atomic — D1 executes the WHERE condition atomically)
import { sql } from 'drizzle-orm';

const result = await db
  .update(schema.rateLimit)
  .set({
    requests: sql`requests + 1`,
    updatedAt: new Date(now),
  })
  .where(
    and(
      eq(schema.rateLimit.id, existing.id),
      sql`requests < ${limitPerHour}`,
    ),
  )
  .run();

if (result.rowsAffected === 0) {
  // Limit was hit between our SELECT and UPDATE — reject (or re-read)
  const retryAfter = Math.ceil((existingWindowStart + 60 * 60 * 1000 - now) / 1000);
  return { allowed: false, remaining: 0, retryAfter: retryAfter > 0 ? retryAfter : 0 };
}

return { allowed: true, remaining: limitPerHour - (existing.requests + 1) };
```

### Verification

- Unit test with concurrent `checkRateLimit` calls hitting the limit boundary
- D1's `sql` template literal is already used elsewhere in this codebase (whoop sync uses `sql\`excluded.*\``)

---

## 2. Batch Whoop Sync Chunks into db.batch()

**Priority:** High (performance)  
**File:** `apps/worker/src/whoop/sync.ts`  
**Effort:** Medium (refactor 5 sync functions, ~60 lines each)

### Problem

Each `sync*` function (lines 403-705) loops over data in `BATCH_SIZE=50` chunks and for each chunk does:

```typescript
await db
  .insert(whoopWorkout)
  .values(values)
  .onConflictDoUpdate({ ... })
```

This is **one round trip to D1 per chunk**. Syncing 200 workouts = 4 round trips. 365 days of whoop data (initial sync) can mean hundreds of round trips across 5 data types. Each D1 round trip has ~10-50ms latency regardless of data size.

### Fix

Group multiple chunks into a single `db.batch()` call to reduce round trips by a factor of `maxStatementsPerBatch` (default 45). The optimal pattern is identical to what `chunkedInsert` already does internally — but `chunkedInsert` doesn't support `onConflictDoUpdate`.

**Option A (preferred): Extend `chunkedInsert` to support `onConflictDoUpdate`**

Add an optional `onConflict` config to `chunkedInsert` in `packages/db/src/utils/d1-batch.ts`:

```typescript
export async function chunkedInsert<T extends AnySQLiteTable>(
  db: DbClient,
  config: {
    table: T;
    rows: T['$inferInsert'][];
    chunkSize?: number;
    maxQueryParams?: number;
    maxStatementsPerBatch?: number;
    onConflict?: {
      target: Parameters<ReturnType<typeof db.insert<T>>['onConflictDoUpdate']>[0];
      set: Parameters<ReturnType<typeof db.insert<T>>['onConflictDoUpdate']>[1];
    };
  },
): Promise<number> {
  // ... existing chunking + batching logic ...
  // In the statement-building loop, change:
  const stmt = db.insert(table).values(chunk);
  if (config.onConflict) {
    statements.push(stmt.onConflictDoUpdate(config.onConflict));
  } else {
    statements.push(stmt);
  }
  // ...
}
```

Then convert each `sync*` function to:

```typescript
async function syncWorkouts(db, userId, workouts): Promise<number> {
  const rows = workouts.map(workout => ({ /* existing value mapping */ }));
  return chunkedInsert(db, {
    table: whoopWorkout,
    rows,
    onConflict: { target: whoopWorkout.whoopWorkoutId, set: { /* excluded.* */ } },
  });
}
```

This eliminates all manual chunking loops from `sync.ts` and reduces it by ~300 lines.

**Option B (simpler, no chunkedInsert change):** Wrap existing per-chunk calls in batches:

```typescript
async function syncWorkouts(db, userId, workouts): Promise<number> {
  const values = workouts.map(workout => ({ /* value mapping */ }));
  const chunks = chunkArray(values, BATCH_SIZE);
  const maxPerBatch = DEFAULT_STATEMENTS_PER_BATCH;

  for (let i = 0; i < chunks.length; i += maxPerBatch) {
    const batchChunks = chunks.slice(i, i + maxPerBatch);
    const statements = batchChunks.map(chunk =>
      db.insert(whoopWorkout).values(chunk).onConflictDoUpdate({ ... })
    );
    await db.batch(statements);
  }
}
```

Option A is strongly preferred because it reduces the sync functions to 5-10 lines each and eliminates duplicated chunking logic.

### Caveat

The whoop batch sync uses `sql\`excluded.column_name\`` for the `set` clause. The `onConflict` config passed to `chunkedInsert` must be compatible with Drizzle's typed `onConflictDoUpdate` API. Since whoop sync already uses `sql` template literals (raw SQL), this should work via Drizzle's `sql` tagged template.

### Verification

- Existing whoop sync tests (if any) should pass
- Manual test: initial sync of 365 days of whoop data should complete in <20 round trips instead of hundreds
- The `chunkedInsert` test in `packages/db/src/utils/d1-batch.test.ts` should be extended with an `onConflict` test case

---

## 3. Unify Chunking in program-helpers.ts with chunkedInsert

**Priority:** Medium (complexity reduction)  
**File:** `apps/worker/src/lib/program-helpers.ts`  
**Effort:** Small (if item 2 Option A is done first)

### Problem

`createWorkoutFromProgramCycleWorkout` (lines 402-437) manually does what `chunkedInsert` does:

```typescript
const exerciseChunkSize = getSafeInsertChunkSize(workoutExerciseRows, 100, 100);
const exerciseChunks = chunkArray(workoutExerciseRows, exerciseChunkSize);
for (const chunk of exerciseChunks) {
  statements.push(db.insert(schema.workoutExercises).values(chunk));
}
// ... repeated for sets ...
await db.batch(statements);
```

The difference from `chunkedInsert` is that this combines inserts for 3 tables (workouts, exercises, sets) + 1 update into a **single** `db.batch()` call — which is actually better than calling `chunkedInsert` 3 times (which would be 3 separate batches/round trips).

### Fix

**Option A (if item 2 Option A is done):** Add a `chunkedInsertStatements` helper that returns statements instead of executing them:

```typescript
// In packages/db/src/utils/d1-batch.ts
export function chunkedInsertStatements<T extends AnySQLiteTable>(
  db: DbClient,
  config: {
    table: T;
    rows: T['$inferInsert'][];
    chunkSize?: number;
    maxQueryParams?: number;
    onConflict?: { ... };  // from item 2
  },
): ReturnType<typeof db.insert<T>>[] {
  // Same chunking logic as chunkedInsert, but returns statements array
  // instead of calling db.batch()
}
```

Then `program-helpers.ts` becomes:

```typescript
const statements: any[] = [db.insert(schema.workouts).values(workoutValues)];
statements.push(...chunkedInsertStatements(db, {
  table: schema.workoutExercises,
  rows: workoutExerciseRows,
}));
statements.push(...chunkedInsertStatements(db, {
  table: schema.workoutSets,
  rows: allSetRows,
}));
statements.push(
  db.update(schema.programCycleWorkouts).set({ ... }).where(...)
);
await db.batch(statements);
```

This eliminates ~35 lines of manual chunking code.

**Option B (no refactor needed):** Leave as-is. The duplication is small (35 lines) and the pattern is valid. Only do Option A if you're already touching `chunkedInsert` for item 2.

### Verification

- `createOneRMTestWorkout` and `createWorkoutFromProgramCycleWorkout` should continue to work identically
- The single `db.batch()` should still be used (not split into multiple round trips)

---

## 4. Batch Exercise Ownership Checks in Sync-Complete

**Priority:** Medium (performance)  
**File:** `apps/worker/src/routes/workouts.ts`  
**Lines:** 566-608  
**Effort:** Medium (refactor exercise resolution loop)

### Problem

The sync-complete handler resolves exercise references in a loop, making 1 DB query per exercise:

```typescript
for (const exercise of exerciseInputs) {
  // 1. Check if user owns this exercise (1 query)
  const ownedExercise = await db.select({ id: ... })
    .from(schema.exercises)
    .where(and(eq(schema.exercises.id, exercise.exerciseId), ...))
    .get();

  if (!ownedExercise) {
    // 2. Potentially create or resolve exercise (1-2 more queries)
    resolvedExerciseId = await getOrCreateExerciseForUser(...);
  }
}
```

For a workout with 10 exercises, this is 10-30 sequential DB queries.

### Fix

Batch the ownership check upfront:

```typescript
// Single query to check all exercise ownership
const allExerciseIds = exerciseInputs.map(e => e.exerciseId);
const ownedExercises = await db
  .select({ id: schema.exercises.id })
  .from(schema.exercises)
  .where(
    and(
      inArray(schema.exercises.id, allExerciseIds),
      eq(schema.exercises.userId, userId),
      eq(schema.exercises.isDeleted, false),
    ),
  )
  .all();

const ownedSet = new Set(ownedExercises.map(e => e.id));

// Now the loop only does work for non-owned exercises
for (const exercise of exerciseInputs) {
  let resolvedExerciseId = exercise.exerciseId;
  if (!ownedSet.has(exercise.exerciseId)) {
    resolvedExerciseId = await getOrCreateExerciseForUser(...);
  }
  resolvedExerciseRows.push({ ... });
}
```

This reduces N queries to 1 for the common case (all exercises already owned).

### Additional: Batch `getOrCreateExerciseForUser` calls

If there are multiple non-owned exercises, they still run sequentially. Could use `Promise.all` since they're independent:

```typescript
const unresolved = exerciseInputs
  .filter(e => !ownedSet.has(e.exerciseId));
const resolved = await Promise.all(
  unresolved.map(e =>
    getOrCreateExerciseForUser(db, userId, e.name, undefined, e.libraryId)
  )
);
```

### Verification

- Sync-complete endpoint should produce identical results
- Test with a workout containing 15+ exercises (mix of owned and new)

---

## 5. DRY Whoop Upsert/Sync Transformation Logic

**Priority:** Low (maintenance)  
**File:** `apps/worker/src/whoop/sync.ts`  
**Effort:** Medium (if item 2 Option A is done, this is partially addressed)

### Problem

Each data type has two functions with identical field-mapping logic:

| Data Type | Single Upsert | Batch Sync | Lines Duplicated |
|-----------|---------------|------------|------------------|
| Workout | `upsertWhoopWorkout` (lines 108-150) | `syncWorkouts` (lines 403-449) | ~30 lines |
| Recovery | `upsertWhoopRecovery` (lines 171-225) | `syncRecoveries` (lines 452-512) | ~40 lines |
| Cycle | `upsertWhoopCycle` (lines 248-300) | `syncCycles` (lines 515-571) | ~35 lines |
| Sleep | `upsertWhoopSleep` (lines 302-380) | `syncSleepRecords` (lines 574-653) | ~55 lines |
| Body | — | `syncBodyMeasurements` (lines 656-704) | ~30 lines |

Total: ~190 lines of duplicated mapping code.

### Fix

Extract shared mapping functions per data type:

```typescript
// Shared mapping — single source of truth
function mapWorkoutRow(userId: string, workout: WhoopWorkout) {
  const zoneDurations = workout.score?.zone_durations;
  return {
    userId,
    whoopWorkoutId: workout.id,
    start: new Date(workout.start),
    end: new Date(workout.end),
    timezoneOffset: workout.timezone_offset,
    sportName: workout.sport_name,
    scoreState: workout.score_state,
    score: workout.score ? JSON.stringify(workout.score) : null,
    during: workout.during ? JSON.stringify(workout.during) : null,
    zoneDuration: zoneDurations ? JSON.stringify(zoneDurations) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Single upsert — uses shared mapper
export async function upsertWhoopWorkout(db, userId, workout): Promise<number> {
  await db.insert(whoopWorkout).values(mapWorkoutRow(userId, workout))
    .onConflictDoUpdate({ target: whoopWorkout.whoopWorkoutId, set: { /* excluded.* */ } });
  return 1;
}

// Batch sync — uses shared mapper + chunkedInsert (item 2)
async function syncWorkouts(db, userId, workouts): Promise<number> {
  return chunkedInsert(db, {
    table: whoopWorkout,
    rows: workouts.map(w => mapWorkoutRow(userId, w)),
    onConflict: { target: whoopWorkout.whoopWorkoutId, set: { /* excluded.* */ } },
  });
}
```

If item 2 Option A is done, the `sync*` functions become 1-liners and the single upserts become thin wrappers around the shared mapper.

### Verification

- All existing whoop sync tests should pass
- Single webhook upsert should produce identical DB rows as batch sync

---

## 6. Transactions for Multi-Statement Operations

**Priority:** Low (data integrity)  
**Files:** `apps/worker/src/lib/program-helpers.ts`, `apps/worker/src/routes/workouts.ts`  
**Effort:** Small (D1 has limitations, local SQLite benefits more)

### Problem

Multi-statement operations use `db.batch()` which groups statements but does **not** provide rollback on failure. If statement 2 of 3 fails, statements before it have already committed:

| Location | Statements | Risk |
|----------|-----------|------|
| `createOneRMTestWorkout` (program-helpers.ts:259) | Insert workout + exercises + sets | Orphaned exercises/sets |
| `createWorkoutFromProgramCycleWorkout` (program-helpers.ts:437) | Insert workout + exercises + sets + update cycleWorkout | Orphaned workout + stale cycleWorkout |
| `sync-complete` (workouts.ts:557-660) | Delete + inserts + update | Partially deleted data |

### Fix

**For D1 (Cloudflare):** D1's `batch()` is the best available — D1 doesn't support full ACID transactions across the edge. No change needed for production.

**For local SQLite (Expo app):** If the Expo app uses these same patterns via `expo-sqlite` + Drizzle, wrap in transactions:

```typescript
await db.transaction(async (tx) => {
  await tx.insert(schema.workouts).values(workoutValues);
  await tx.insert(schema.workoutExercises).values(workoutExerciseRows);
  await tx.insert(schema.workoutSets).values(setRows);
});
```

Check `apps/expo/db/workouts.ts` and `apps/expo/db/sync-queue.ts` for equivalent patterns that could benefit.

### Decision

This is low priority because:
1. D1 doesn't support it anyway
2. The failure rate for mid-batch errors is very low
3. The affected operations are user-initiated and can be retried

Only implement if local SQLite corruption is a reported issue.

---

## Summary of Changes

| # | What | Files Changed | Lines Changed | Risk |
|---|------|--------------|---------------|------|
| 1 | Atomic rate limit | `rate-limit.ts` | ~10 | Low |
| 2 | Batch whoop sync | `d1-batch.ts` + `whoop/sync.ts` | +20 / -300 | Medium |
| 3 | Unify chunking | `d1-batch.ts` + `program-helpers.ts` | +15 / -35 | Low |
| 4 | Batch exercise checks | `workouts.ts` | ~20 | Low |
| 5 | DRY whoop mappers | `whoop/sync.ts` | ~-190 lines | Low |
| 6 | Transactions (local) | `apps/expo/db/*.ts` | ~20 | Low |

## Dependencies

```
Item 2 (chunkedInsert onConflict) ──→ Item 3 (chunkedInsertStatements) easier
                                  ──→ Item 5 (DRY whoop) becomes trivial

Item 1 is fully independent
Item 4 is fully independent
Item 6 is fully independent
```

**Recommended order:** 1 → 2 → 3 → 5 → 4 → 6

## Testing Strategy

All items:
1. Run `bun run check` (lint + fmt + typecheck) after each item
2. Run `bun run test` (Vitest) — especially `packages/db/src/utils/d1-batch.test.ts` for items 2-3
3. Any API-level changes should be manually tested against local/dev D1:
   - `bun run dev` then hit the affected endpoints
   - For whoop sync: trigger a sync and verify data integrity

Items 1, 4: Add Vitest unit tests for the refactored functions.
Item 2: Extend `d1-batch.test.ts` with `onConflict` test case.
Item 5: Existing whoop tests should pass with no changes to public API.

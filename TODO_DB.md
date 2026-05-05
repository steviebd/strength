# Database Operations Improvements Work Order

## Overview

Implement the database operation improvements below. This file is a work order for another
agent: treat the examples as implementation guidance, not code to copy verbatim. Preserve the
repo's existing Drizzle/D1 patterns and run the verification commands at the end.

The highest priority item is the rate limiter because it has real correctness risk under
concurrency. The Whoop and sync-complete items are performance/maintainability work.

---

## 1. Fix Rate Limit Concurrency

**Priority:** Critical  
**Files:** `apps/worker/src/lib/rate-limit.ts`, `packages/db/src/schema.ts`,
`packages/db/drizzle/migrations/`  
**Effort:** Small/medium

### Problem

`checkRateLimit` currently uses read-then-write:

```typescript
const existing = await db.select().from(schema.rateLimit).where(...).get();
// ...
await db
  .update(schema.rateLimit)
  .set({ requests: existing.requests + 1 })
  .where(eq(schema.rateLimit.id, existing.id))
  .run();
```

This has two races:

1. Existing-row increment race:

```text
Request A: SELECT requests=5 -> OK -> UPDATE requests=6
Request B: SELECT requests=5 -> OK -> UPDATE requests=6
Result: only 6 requests counted instead of 7
```

2. First-request insert race:

The `rate_limit` table currently has indexes on `user_id`, `endpoint`, and `window_start`, but no
unique constraint for `(user_id, endpoint)`. Concurrent first requests for the same user/endpoint can
insert duplicate limiter rows, after which future reads with `.get()` are ambiguous.

### Requirements

- Add a unique constraint for one active rate-limit row per `(userId, endpoint)`.
  - Update `packages/db/src/schema.ts`.
  - Add a Drizzle migration in `packages/db/drizzle/migrations/`.
  - Confirm existing data cleanup/backfill needs before applying the unique constraint. If duplicate
    rows can already exist, the migration must consolidate or delete duplicates safely.
- Replace the non-atomic increment with server-side SQL such as `requests = requests + 1`.
- Check the limit in the same update statement, for example `WHERE requests < ${limitPerHour}` for
  the current window.
- Handle the first-insert race with the new unique constraint. Acceptable approaches:
  - Use insert/upsert logic keyed by `(userId, endpoint)`, or
  - Attempt insert, catch unique conflict, then fall through to the atomic update path.
- Preserve reset behavior when the stored `windowStart` is older than the current hour.
- Confirm the actual Drizzle D1 `.run()` return shape before using it. Existing tests may mock
  `rowsAffected`, but Cloudflare D1 exposes changed row counts through result metadata such as
  `meta.changes`. Implement this in the shape that passes real typecheck and tests.

### Verification

- Add focused Vitest coverage for:
  - incrementing below the limit,
  - rejecting at/over the limit,
  - resetting an old window,
  - duplicate insert/upsert behavior at first request where practical.
- Run `bun run check`.
- Run `bun run test`.

---

## 2. Batch Whoop Sync Chunks into `db.batch()`

**Priority:** High  
**Files:** `apps/worker/src/whoop/sync.ts`, `packages/db/src/utils/d1-batch.ts`,
`packages/db/src/utils/d1-batch.test.ts`  
**Effort:** Medium

### Problem

Each Whoop `sync*` function loops over `BATCH_SIZE=50` chunks and executes one D1 request per chunk:

```typescript
await db
  .insert(whoopWorkout)
  .values(values)
  .onConflictDoUpdate({ ... });
```

Initial syncs can produce many chunks across workouts, recoveries, cycles, sleep, and body
measurements. The existing `chunkedInsert` helper already batches plain inserts, but it does not
support `onConflictDoUpdate`, so Whoop sync cannot use it yet.

### Preferred Fix

Extend `packages/db/src/utils/d1-batch.ts` so callers can build batched insert statements with
`onConflictDoUpdate`.

Implementation notes:

- Keep the existing safe chunk-size logic from `getSafeInsertChunkSize`.
- Keep `maxStatementsPerBatch` behavior.
- Preserve return count semantics. For upserts, decide whether the function should return input row
  count or affected row count, then keep all callers/tests consistent.
- The generic TypeScript shape for Drizzle's `onConflictDoUpdate` is subtle. Do not copy a brittle
  `Parameters<ReturnType<typeof db.insert<T>>...>` type if it does not typecheck. Prefer a pragmatic
  local config type that preserves useful typing at call sites and passes `bun run check`.
- Whoop sync uses `sql\`excluded.column_name\`` in conflict update sets. Preserve the existing
  target columns and update columns exactly unless there is a tested reason to change them.

Expected usage shape:

```typescript
return chunkedInsert(db, {
  table: whoopWorkout,
  rows: workouts.map((workout) => mapWorkoutRow(userId, workout)),
  onConflictDoUpdate: {
    target: whoopWorkout.whoopWorkoutId,
    set: {
      userId: sql`excluded.user_id`,
      updatedAt: sql`excluded.updated_at`,
      // preserve existing set fields
    },
  },
});
```

If a clean helper type becomes too invasive, use a smaller helper specific to batched upserts in
`whoop/sync.ts`, but still use `db.batch()` to reduce D1 round trips.

### Verification

- Extend `packages/db/src/utils/d1-batch.test.ts` with an `onConflictDoUpdate`/upsert statement
  construction case.
- Run `bun run check`.
- Run `bun run test`.
- Manually verify a Whoop sync against local/dev D1 if credentials and test data are available.

---

## 3. Optional: Unify Program Helper Chunking

**Priority:** Medium/optional  
**Files:** `packages/db/src/utils/d1-batch.ts`, `apps/worker/src/lib/program-helpers.ts`  
**Effort:** Small if item 2 adds reusable statement builders

### Context

`createWorkoutFromProgramCycleWorkout` manually chunks workout exercise and set inserts, then combines
those statements with the workout insert and `programCycleWorkouts` update in one `db.batch()`.

That existing behavior is good because it preserves a single batched statement sequence. Do not
replace it with multiple `chunkedInsert` calls that create separate batches.

### Optional Fix

Only if item 2 naturally creates a reusable statement builder, add something like
`chunkedInsertStatements` that returns insert/upsert statements without executing them.

Then `program-helpers.ts` can use that helper while preserving a single final `db.batch(statements)`.

### Verification

- Existing `createOneRMTestWorkout`, `createWorkoutFromProgramCycleWorkout`, and program helper tests
  should continue to pass.
- Confirm the final implementation still uses one `db.batch()` for the combined operation.

---

## 4. Batch Exercise Ownership Checks in Sync-Complete

**Priority:** Medium  
**File:** `apps/worker/src/routes/workouts.ts`  
**Effort:** Medium

### Problem

The sync-complete handler resolves exercise references in a loop. For each exercise it checks whether
the user owns the exercise, then potentially calls `getOrCreateExerciseForUser` or
`resolveToUserExerciseId`.

For workouts with many exercises this creates many sequential DB reads.

### Fix

Validate the exercise input shape first, then batch the ownership check:

```typescript
const allExerciseIds = exerciseInputs.map((exercise) => exercise.exerciseId);
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

const ownedSet = new Set(ownedExercises.map((exercise) => exercise.id));
```

Then the loop only resolves exercises not present in `ownedSet`.

Be careful with `Promise.all` for unresolved exercises. It is safe only if the operations are truly
independent for the same user. `getOrCreateExerciseForUser` already uses an upsert for library-backed
exercises, but custom-name exercise creation does a read then insert without a unique name constraint.
Avoid introducing duplicate custom exercises through parallel calls.

### Verification

- Existing workout route tests should pass.
- Add or update coverage for sync-complete with:
  - all exercises already owned,
  - a mix of owned exercises and library exercise IDs,
  - invalid exercise input still returning the same 400 behavior.

---

## 5. Optional: DRY Whoop Mapping Logic

**Priority:** Low  
**File:** `apps/worker/src/whoop/sync.ts`  
**Effort:** Medium

### Problem

Single webhook upsert functions and batch sync functions duplicate field mapping for workouts,
recoveries, cycles, and sleep records.

### Fix

After item 2, extract shared row-mapping helpers only where it improves clarity and preserves types.

Example shape:

```typescript
function mapWorkoutRow(userId: string, workout: WhoopWorkout, now = new Date()) {
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
    createdAt: now,
    updatedAt: now,
  };
}
```

Use a single `now` per operation where the current code expects consistent timestamps.

### Verification

- Existing Whoop tests should pass.
- Single webhook upsert and batch sync should continue to produce equivalent rows for the same input.

---

## 6. Do Not Replace D1 `batch()` for Transaction Reasons

**Priority:** Documentation/guardrail  
**Files:** None unless updating comments/tests  
**Effort:** None

### Corrected Finding

The previous note that D1 `batch()` does not roll back prior statements on failure was incorrect.
Cloudflare documents D1 `batch()` as transactional for the provided SQL statements: batched statements
are executed sequentially and are rolled back if one statement fails.

Source: <https://developers.cloudflare.com/d1/worker-api/d1-database/>

### Guidance

- Do not replace existing D1 `db.batch()` calls with another mechanism solely for rollback.
- `db.batch()` does not cover arbitrary application logic around reads and writes, so still be careful
  with multi-step workflows that perform reads, branching logic, then later batches.
- Expo/local SQLite transaction work is out of scope for this work order unless there is a reported
  local data-integrity bug.

---

## Recommended Order

1. Rate limit uniqueness + atomic increment.
2. Whoop batched upserts.
3. Optional program helper statement builder, only if it falls out cleanly from item 2.
4. Sync-complete batched ownership checks.
5. Optional Whoop mapper cleanup.

## Testing Strategy

Run after meaningful changes:

```bash
bun run check
bun run test
```

Add focused tests near the changed code:

- Item 1: rate-limit behavior and migration/schema expectations.
- Item 2: `packages/db/src/utils/d1-batch.test.ts` for upsert batching.
- Item 4: sync-complete behavior if route test infrastructure already exists.

Manual checks where available:

- `bun run dev` and hit affected worker endpoints.
- Trigger or simulate a Whoop sync against local/dev D1 and verify row counts/data integrity.

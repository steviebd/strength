# Plan: Refactor `chunkedInsert` to Use D1 `batch()`

## Overview

Refactor `packages/db/src/utils/d1-batch.ts` to use D1's atomic `db.batch()` API while handling both D1's 100 statement limit and SQLite's 100 bind parameter limit.

## Current State

- `chunkedInsert` sequentially calls `db.insert().values(chunk).run()` for each chunk
- Each chunk is sized to stay under the 100 param limit
- No atomicity guarantees

## New Implementation

**Function: `chunkedInsert`**

```typescript
export async function chunkedInsert<T extends AnySQLiteTable>(
  db: DbClient,
  config: {
    table: T;
    rows: T['$inferInsert'][];
    chunkSize?: number;
    maxQueryParams?: number;
  },
): Promise<number>
```

**Logic flow:**

1. Calculate safe chunk size to stay under param limit (existing `getSafeInsertChunkSize`)
2. Split rows into chunks (each chunk = 1 INSERT statement)
3. Group chunks into batches of ≤100 statements
4. Execute each batch via `db.batch(statements)` - each batch is atomic
5. Sum `rowsAffected` across all batches

**Key constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_MAX_QUERY_PARAMS` | 100 | D1/SQLite param limit per statement |
| `DEFAULT_STATEMENTS_PER_BATCH` | 100 | D1 API limit per batch call |

**Example:**

```
Workout with 300 sets, 42 params per row:
- safeChunkSize = floor(100 / 42) = 2 rows per chunk = 1 statement
- 300 sets → 150 chunks → 2 batches of 75 statements each
```

## Implementation Steps

### 1. Add constant

Add `DEFAULT_STATEMENTS_PER_BATCH = 100` to `d1-batch.ts`.

### 2. Create helper

Create `buildInsertStatement(table, chunk)` that returns a prepared insert query object (not executed).

### 3. Refactor `chunkedInsert`

```
rows → chunks (based on param limit) → batches of 100 chunks → db.batch() each batch
```

Pseudocode:

```typescript
export async function chunkedInsert<T extends AnySQLiteTable>(
  db: DbClient,
  config: { table: T, rows: T['$inferInsert'][], chunkSize?: number, maxQueryParams?: number },
): Promise<number> {
  const { table, rows, chunkSize = DEFAULT_CHUNK_SIZE, maxQueryParams = DEFAULT_MAX_QUERY_PARAMS } = config;

  if (rows.length === 0) return 0;

  const safeChunkSize = getSafeInsertChunkSize(rows, chunkSize, maxQueryParams);
  const chunks = chunkArray(rows, safeChunkSize);

  // Group chunks into batches of 100 statements
  const STATEMENTS_PER_BATCH = 100;
  let insertedRows = 0;

  for (let i = 0; i < chunks.length; i += STATEMENTS_PER_BATCH) {
    const batchChunks = chunks.slice(i, i + STATEMENTS_PER_BATCH);
    const statements = batchChunks.map(chunk => db.insert(table).values(chunk));
    const results = await db.batch(statements);
    insertedRows += results.reduce((sum, r) => sum + r.rowsAffected, 0);
  }

  return insertedRows;
}
```

### 4. Update tests

Add/update tests in `d1-batch.test.ts`:

- **Test: single batch** (≤100 statements) succeeds atomically
- **Test: large insert** splits into multiple atomic batches
- **Test: partial failure** behavior documented

## File Changes

| File | Change |
|------|--------|
| `packages/db/src/utils/d1-batch.ts` | Refactor `chunkedInsert` to use `db.batch()` |
| `packages/db/src/utils/d1-batch.test.ts` | Add/update tests |

## Semantic Change

| Aspect | Before | After |
|--------|--------|-------|
| Execution | Sequential inserts | Batched atomic inserts |
| Partial failure | Possible (some inserts succeed) | Each batch (≤100) succeeds or fails together |
| Large operations | N sequential calls | Multiple atomic batches |

## Backward Compatibility

- **API unchanged**: `chunkedInsert(db, { table, rows, chunkSize, maxQueryParams })`
- **Return value unchanged**: Total `rowsAffected` count

## D1 Limits Reference

| Limit | Value | Source |
|-------|-------|--------|
| Host parameters per statement | 32766 (SQLite 3.32.0+) | SQLite itself |
| Statements per batch | 100 | D1 API constraint |

The implementation handles both: param limit via chunk sizing, statement limit via batch grouping.

## Verification

```bash
bun run check  # lint + fmt + typecheck
bun run test   # run tests
```

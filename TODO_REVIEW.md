# Review Work Order

## Token Lock Approach (REVIEW.md Issue #16)

Pros/cons for the three options:

### Option A: Optimistic Concurrency on `updatedAt`

| Pro | Con |
|-----|-----|
| No new tables or D1 overhead | Both concurrent calls still hit WHOOP API (wastes API calls) |
| Zero extra queries — just adds `WHERE updatedAt = ?` to existing UPDATE | Must implement retry on conflict — second writer needs to re-fetch and try again |
| Aligns with existing pattern in `rate-limit.ts` | Window for conflict is large if WHOOP API is slow (500ms+) |
| ~5 lines changed | If first refresh consumed the old token, second refresh may fail at WHOOP |

### Option B: D1 Lock Table with TTL

| Pro | Con |
|-----|-----|
| Guarantees exactly one refresher across all isolates | New table + migration |
| Self-cleaning — TTL expires stale locks from crashed workers | Extra DB writes per refresh (INSERT + DELETE) |
| Second caller waits for first (no wasted WHOOP calls) | TTL must be tuned: long enough for WHOOP API, short enough for retries |
| Simple INSERT-then-DELETE pattern | Lock contention means second caller blocks instead of failing fast |

### Option C: Durable Objects

| Pro | Con |
|-----|-----|
| Single-writer guarantee built into the platform | New Cloudflare binding + wrangler.toml changes |
| No D1 dependency for locking | Adds cost (DOs have separate pricing) |
| Perfect fit for this use case | Architecture change — new code pattern, deployment complexity |
| No TTL tuning needed | Overkill for this single-purpose lock |

**Recommendation**: Option B (D1 lock table). Single-writer guarantee across all isolates, minimal code change, no new CF bindings, self-cleaning on crash via TTL.

---

## Work Order

### Phase 1 — Crash, Corruption & Race Condition Fixes

- [ ] **1.1** Add `userId` to mutation WHERE clauses (TOCTOU ownership)
  - **Files**:
    - `apps/worker/src/api/nutrition/entries.$id.ts:93-100` — add `eq(nutritionEntries.userId, userId)` to the UPDATE SET isDeleted query
    - `apps/worker/src/routes/program-cycles.ts:614-618` — add `eq(userProgramCycles.userId, userId)` via JOIN to the schedule UPDATE
    - `apps/worker/src/routes/workouts.ts:355-362` — add cycle ownership verification (JOIN through cycles) to the workout delete null-out query
  - **Effort**: Small (~10 lines)

- [ ] **1.2** Add `completedAt` guard to `PUT /workouts/:id/complete` (`workouts.ts:694`)
  - If `completedAt` is already set, return early (idempotent exit)
  - Only call `advanceProgramCycleForWorkout` on the first completion
  - **Effort**: Small (3 lines)

- [ ] **1.3** Fix infinite loop in scheduler (`scheduler.ts:94`)
  - Add max-iteration counter (e.g., 365) to the `while (!foundDate)` loop
  - Throw or return error if max iterations exceeded
  - **File**: `apps/worker/src/routes/programs.ts:100`
  - Fix truthiness check: `preferredGymDays?.length ? preferredGymDays : ['monday', 'wednesday', 'friday']`
  - **Test**: Add test case with empty `preferredDays` array
  - **Effort**: Small (~10 lines)

- [ ] **1.4** Fix read-modify-write on `totalSessionsCompleted`
  - **File**: `apps/worker/src/routes/program-cycles.ts:496-534`
  - Replace `const newSessionsCompleted = totalSessionsCompleted + 1` → `sql`totalSessionsCompleted + 1`` in UPDATE SET
  - **File**: `apps/worker/src/lib/program-helpers.ts:556-641`
  - Same fix in `advanceProgramCycleForWorkout`
  - **Test**: Verify existing cycle tests still pass
  - **Effort**: Small (~4 lines)

- [ ] **1.5** Fix TOCTOU idempotency in workout sync (`workouts.ts:398`)
  - Move the `workoutSyncOperations` INSERT to the very start of the handler
  - Use `onConflictDoNothing()` on INSERT
  - If `rowsAffected === 0` → operation already exists → fetch state and return existing result
  - Only proceed to mutations if INSERT succeeded
  - **Test**: Add concurrent sync test (or verify existing idempotency tests still pass)
  - **Effort**: Medium (restructure ~30 lines)

- [ ] **1.6** Fix read-then-insert races in all handlers
  - Replace SELECT-then-INSERT patterns with `onConflictDoNothing()` + `rowsAffected` check, or `onConflictDoUpdate` (upsert):
    - `apps/worker/src/lib/program-helpers.ts:199-266` — `createOneRMTestWorkout`
    - `apps/worker/src/lib/program-helpers.ts:458-529` — `startCycleWorkout`
    - `apps/worker/src/lib/program-helpers.ts:645-691` — `resolveToUserExerciseId` (adds try/catch around INSERT with fallback SELECT)
    - `apps/worker/src/api/nutrition/body-stats.ts:32-74` — `upsertBodyStatsHandler`
    - `apps/worker/src/api/nutrition/training-context.ts:31-69` — `upsertTrainingContextHandler`
    - `apps/worker/src/routes/profile.ts:25-45` — profile preferences creation
  - **Effort**: Medium (~30 lines across 6 files)

- [ ] **1.7** Fix TOCTOU in chat `syncOperationId` idempotency (`chat.ts:378`)
  - Replace SELECT check + INSERT with single `onConflictDoNothing()` INSERT
  - If `rowsAffected === 0` → job already exists → fetch and return existing job
  - Only insert user message after confirming the job INSERT succeeded
  - **Effort**: Medium (restructure ~20 lines)

- [ ] **1.8** Make chat queue worker status transition atomic (`chat.ts:471`)
  - Replace `db.update(...).set({ status: 'processing' })` with:
    ```ts
    const result = await db.update(schema.nutritionChatJobs)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(and(
        eq(schema.nutritionChatJobs.id, jobId),
        eq(schema.nutritionChatJobs.status, 'pending'),
      ))
      .run();
    if ((result.meta?.changes ?? 0) === 0) return; // another worker took it
    ```
  - **Effort**: Small (5 lines)

- [ ] **1.9** Add unique constraint on `(userId, name)` for exercises
  - **File**: `packages/db/src/schema.ts:83-101`
  - Add unique index on `(userId, lower(name))` to prevent duplicate custom exercises
  - New migration
  - **File**: `packages/db/src/program/exercise.ts:108-124`
  - Add `onConflictDoNothing()` to the custom exercise INSERT with a fallback SELECT
  - **Effort**: Medium (new migration + ~10 lines)

- [ ] **1.10** Wrap multi-step mutations in transactions
  - **File**: `apps/worker/src/routes/templates.ts:140-415` — wrap template copy/update in `db.transaction()`
  - **File**: `apps/worker/src/routes/program-cycles.ts:158-389` — wrap cycle update/1RM test update in `db.transaction()`
  - **File**: `apps/worker/src/lib/program-helpers.ts:259,453` — audit `db.batch()` usages, replace with `db.transaction()` where atomicity needed
  - **Test**: Verify template copy/cycle update works within transaction
  - **Effort**: Medium (audit + ~30 lines across 3 files)

- [ ] **1.11** Add concurrent WHOOP sync guard
  - **File**: `apps/worker/src/whoop/sync.ts:709-855`
  - Add `sync_status` column to `user_integration` (or check existing sync in progress)
  - Return early if a sync is already running for this user
  - **Effort**: Medium (new column + ~15 lines)

- [ ] **1.12** Fix user preferences PUT read-merge-write race
  - **File**: `apps/worker/src/routes/profile.ts:57-136`
  - Add `updatedAt` optimistic concurrency check: SELECT reads `updatedAt`, UPDATE includes `WHERE updatedAt = oldValue`
  - If 0 rows affected → conflict → retry (max 3 times)
  - **Effort**: Medium (~15 lines)

- [ ] **1.13** Replace in-memory token lock with D1 lock table
  - **New table**: `token_refresh_lock` with columns `integrationId` (PK), `lockedAt` (timestamp_ms), `expiresAt` (timestamp_ms)
  - New migration for the lock table
  - **File**: `apps/worker/src/whoop/token-rotation.ts`
  - Replace `refreshLocks` Map with INSERT-then-DELETE pattern:
    1. INSERT lock row with `expiresAt = now + 30s`
    2. If UNIQUE constraint → another isolate holds lock → poll/wait up to 30s
    3. Refresh WHOOP token
    4. DELETE lock row
    5. On error/crash: lock auto-expires via TTL (cleanup query on next lock attempt)
    6. Also run cleanup: `DELETE FROM token_refresh_lock WHERE expiresAt < now()` on lock attempts
  - **Test**: Simulate concurrent refresh (or unit test the lock logic)
  - **Effort**: Medium (new migration + ~40 lines)

- [ ] **1.14** Add optimistic concurrency to token refresh UPDATE
  - **File**: `apps/worker/src/whoop/token-rotation.ts:107-115`
  - Add `eq(userIntegration.updatedAt, integration.updatedAt)` to the WHERE clause
  - If `rowsAffected === 0` → another request already refreshed → re-read and return
  - **Effort**: Small (3 lines)

- [ ] **1.15** Soft-delete children when soft-deleting a workout
  - **File**: `apps/worker/src/routes/workouts.ts:344-365`
  - Add UPDATE to set `isDeleted: true` on related `workout_exercises` and `workout_sets`
  - Or document the design choice and verify all queries filter through parent's `isDeleted`
  - **Effort**: Small (~5 lines or audit existing queries)

- [ ] **1.16** Make `requireAuth` return `undefined` instead of null tuple
  - **File**: `apps/worker/src/api/auth.ts:67-71`
  - Change return to `undefined` (forces explicit null check) or throw an error
  - Add JSDoc comment documenting that callers must check for null
  - **Effort**: Trivial (2 lines)

---

### Phase 2 — Resource & Performance

- [ ] **2.1** Fix WHOOP recovery query missing date filter
  - **File**: `apps/worker/src/routes/whoop.ts:211-215`
  - Add `gt(whoopRecovery.date, since)` to the recovery WHERE clause
  - **Effort**: Trivial (1 line)

- [ ] **2.2** Add LIMIT caps to unbounded queries
  - **File**: `apps/worker/src/routes/workouts.ts:89-106` — clamp `limit` to max 100
  - **File**: `apps/worker/src/routes/whoop.ts:210-231` — add `LIMIT 100` to recovery, sleep, cycles, workouts queries
  - **File**: `apps/worker/src/routes/exercises.ts:10-33` — add `LIMIT 50` to search query
  - **File**: `apps/worker/src/api/nutrition/entries.ts:7-40` — add `LIMIT 50` or cursor pagination
  - **Effort**: Small (~10 lines across 4 files)

- [ ] **2.3** Cap `fetchWhopCollection` page iterations
  - **File**: `apps/worker/src/whoop/api.ts:162-191`
  - Add max page count (e.g., 50 pages per category) in the do/while loop
  - Log warning if limit hit (indicates data volume exceeds expectations)
  - **Effort**: Small (5 lines)

- [ ] **2.4** Fix unvalidated `parseInt` on `days`/`limit` query params
  - **File**: `apps/worker/src/routes/whoop.ts:204` — validate `days` is finite and positive
  - **File**: `apps/worker/src/routes/workouts.ts:90` — validate `limit` is finite and positive
  - **Effort**: Trivial (2 lines each)

- [ ] **2.5** Add timeouts to all external API calls
  - **File**: `apps/worker/src/whoop/api.ts` — add `AbortController` timeout (10s) to `fetchWhoopJson`
  - **File**: `apps/worker/src/whoop/auth.ts:48,79` — add timeout (10s) to WHOOP OAuth token exchange
  - **File**: `apps/worker/src/api/nutrition/chat.ts:279` — add explicit timeout (30s) to AI `generateText`
  - **Effort**: Small (~15 lines across 3 files)

- [ ] **2.6** Restructure home summary endpoint
  - **File**: `apps/worker/src/api/home/summary.ts`
  - **New approach**:
    1. Add a `home_summary` materialized table (or `home_summary_cache` column on `user`)
       - `streakCount`, `lastWorkoutDate`, `weeklyVolume`, `weeklyWorkouts`, `updatedAt`
    2. Recompute on `POST /workouts/:id/complete` and `POST /workouts/:id/sync-complete`
    3. Home endpoint reads single row from cache
    4. Add fallback: if cache is stale (updatedAt older than last workout), recompute inline
  - **Migration**: New table or column
  - **Test**: Verify home summary data matches after workout completion
  - **Effort**: Large (new migration, rewrite handler, add recompute triggers in 2 handlers)

- [ ] **2.7** Add resource limits to training offline snapshot
  - **File**: `apps/worker/src/routes/training.ts`
  - Add `LIMIT 50` to templates query
  - Add `LIMIT 200` to exercises query
  - Replace N+1 cycle query loop with single JOIN query:
    ```ts
    db.select().from(schema.userProgramCycles)
      .leftJoin(schema.programCycleWorkouts, eq(...))
      .where(eq(schema.userProgramCycles.userId, userId))
      .all()
    ```
  - **Effort**: Medium (~30 lines)

- [ ] **2.8** Cap WHOOP sync peak memory
  - **File**: `apps/worker/src/whoop/sync.ts:777-818`
  - Change `Promise.all([...5 fetches...])` to sequential: fetch workout → upsert → fetch recovery → upsert → ...
  - Each category freed from memory before next starts
  - **Trade**: Additional round trips to WHOOP API (5 sequential vs 5 parallel)
  - **Effort**: Small (restructure ~20 lines, remove Promise.all)

- [ ] **2.9** Add date bound to `getLastCompletedExerciseSnapshots`
  - **File**: `apps/worker/src/lib/program-helpers.ts:769`
  - Add `gte(schema.workouts.startedAt, ninetyDaysAgo)` filter to the historical query
  - Add `LIMIT 50` to the result
  - **Effort**: Small (5 lines)

- [ ] **2.10** Add LIMIT to home summary 365-day workout query (interim)
  - **File**: `apps/worker/src/api/home/summary.ts:326`
  - Add `LIMIT 500` — covers even extreme daily workout users
  - **Note**: Moot after 2.6 full restructure, but useful as quick fix
  - **Effort**: Trivial (1 line)

- [ ] **2.11** Cap chat history messages sent to AI model
  - **File**: `apps/worker/src/api/nutrition/chat.ts:271`
  - Cap prior messages at last 20 (or estimate tokens and trim to 4K token budget)
  - Prevents context window overflow and excessive AI costs on long conversations
  - **Effort**: Small (~10 lines)

- [ ] **2.12** Add timeout to queue worker AI model call
  - **File**: `apps/worker/src/api/nutrition/chat.ts:279-283`
  - Add `AbortController` with 30s timeout to `generateText` call
  - On timeout, mark job as `failed` so it isn't retried
  - **Effort**: Small (5 lines)

- [ ] **2.13** Cache Better Auth instance per request
  - **File**: `apps/worker/src/api/auth.ts:43-46`
  - Store created auth instance on the Hono context (`c.set('auth', auth)`)
  - `loadAuthSession` checks context first before calling `getAuth`
  - Avoids re-creating the Drizzle adapter and parsing config on every middleware call
  - **Effort**: Small (~10 lines)

---

### Phase 3 — Data Integrity & Validation

- [ ] **3.1** Fix rate limiter insert-or-update race
  - **File**: `apps/worker/src/lib/rate-limit.ts`
  - Replace catch-then-select-then-update with a single upsert:
    ```ts
    db.insert(schema.rateLimit).values({...})
      .onConflictDoUpdate({
        target: [schema.rateLimit.userId, schema.rateLimit.endpoint],
        set: { requests: sql`CASE WHEN requests < ${limit} THEN requests + 1 ELSE requests END`, ... }
      })
    ```
  - **Effort**: Medium (rewrite ~50 lines)

- [ ] **3.2** Sync Drizzle schema with rate limit migration
  - **File**: `packages/db/src/schema.ts:488-498`
  - Add to table extras callback:
    ```ts
    (t) => [unique('rate_limit_user_id_endpoint_unique').on(t.userId, t.endpoint)]
    ```
  - **Effort**: Trivial (2 lines)

- [ ] **3.3** Add timeout to D1 chunkedInsert
  - **File**: `packages/db/src/utils/d1-batch.ts:165-187`
  - Add configurable timeout or max-round guard to prevent unbounded batch execution
  - **Effort**: Small (~10 lines)

---

### Phase 4 — Security Hardening

- [ ] **4.1** Rotate secrets and remove plaintext from `wrangler.toml`
  - Rotate all secrets that have been in plaintext on disk
  - Use `wrangler secret put` for: BETTER_AUTH_SECRET, ENCRYPTION_MASTER_KEY, GOOGLE_CLIENT_SECRET, WHOOP_CLIENT_SECRET, WHOOP_WEBHOOK_SECRET
  - Update `generate-wrangler-config.ts` to stop writing secrets into the generated config
  - Update `.gitignore` if needed (already ignores wrangler.toml, verify it's working)
  - **Effort**: Ops (~30 min)

- [ ] **4.2** Add request body size limit globally
  - **File**: `apps/worker/src/index.ts`
  - Configure Hono body size limit (e.g., 1 MB) on all routes
  - **Effort**: Trivial (1 line)

- [ ] **4.3** Validate image base64 size before storing
  - **File**: `apps/worker/src/api/nutrition/chat.ts:405-416`
  - Reject images over a reasonable limit (e.g., 500 KB base64 = ~375 KB raw)
  - Return 413 Payload Too Large for oversized images
  - **Effort**: Small (5 lines)

- [ ] **4.4** Add security headers middleware
  - **File**: `apps/worker/src/index.ts`
  - Add middleware on `*` that sets:
    ```
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    Referrer-Policy: strict-origin-when-cross-origin
    Content-Security-Policy: default-src 'self'
    ```
  - **Test**: Verify headers are present on all responses (unit test or integration test)
  - **Effort**: Small (~20 lines)

- [ ] **4.5** Apply rate limiting as global middleware
  - **File**: `apps/worker/src/index.ts`
  - Add `checkRateLimit` middleware on `/api/*` (after CORS, before auth context)
  - Configure per-endpoint limits:
    - Auth endpoints (`/api/auth/sign-in/*`, `/api/auth/sign-up/*`): 20 req/hr
    - Nutrition chat: 60 req/hr (existing, keep)
    - All other CRUD: 500 req/hr (generous, prevents abuse)
  - **File**: `apps/worker/src/lib/rate-limit.ts`
  - Add `getRateLimitByEndpoint()` helper that returns limits per endpoint pattern
  - Use `c.req.path` or `c.req.routePath` as the endpoint key
  - **Effort**: Medium (~50 lines across 2 files)

- [ ] **4.6** Fix WHOOP webhook rate limit to use app user ID
  - **File**: `apps/worker/src/index.ts:301-309`
  - Move `resolveWhoopUserId()` call before `checkRateLimit()`
  - Pass resolved app user ID to rate limiter instead of WHOOP external ID
  - **Effort**: Trivial (move 1 line, change 1 parameter)

- [ ] **4.7** Harden CORS dev origins
  - **File**: `apps/worker/src/index.ts:67-68`
  - Add guard: dev CORS origins only active when NOT in a Cloudflare environment
  - Check `c.env.CF` or `c.req.header('cf-connecting-ip')` to detect CF edge
  - **Effort**: Small (3 lines)

- [ ] **4.8** Harden encryption key validation
  - **File**: `apps/worker/src/utils/crypto.ts:45-50`
  - Add minimum length check for UTF-8 fallback keys (e.g., 32 bytes)
  - Or require explicit base64/hex format and fail on unknown format
  - **Effort**: Small (5 lines)

- [ ] **4.9** Remove IP/user-agent exposure from `/api/me`
  - **File**: `apps/worker/src/routes/health.ts:38-39`
  - Remove `ipAddress` and `userAgent` from `safeSession` object
  - **Effort**: Trivial (remove 2 lines)

- [ ] **4.10** Protect or document unauthenticated program listing endpoint
  - **File**: `apps/worker/src/routes/programs.ts:23`
  - Either add `createHandler` wrapper (if this should be protected)
  - Or document in AGENTS.md that static program metadata is intentionally public
  - **Effort**: Trivial (add wrapper or update docs)

- [ ] **4.11** Escape LIKE wildcards in exercise search
  - **File**: `apps/worker/src/routes/exercises.ts:16`
  - Escape `%`, `_`, and `\` characters in user search input before passing to `like()`
  - **Effort**: Trivial (3 lines)

- [ ] **4.12** Parameterize Expo local migration queries
  - **File**: `apps/expo/db/migrations.ts:240,255`
  - Replace string interpolation with parameterized queries:
    ```ts
    sqlite.getAllSync('SELECT id FROM local_schema_migrations WHERE id = ? LIMIT 1', [id])
    ```
  - **Effort**: Small (5 lines)

- [ ] **4.13** Fix CORS `startsWith` to use exact origin matching
  - **File**: `apps/worker/src/index.ts:92`
  - Replace `origin.startsWith(allowed)` with exact comparison: `origin === allowed` for production
  - For `baseURLOrigin`, use `new URL(origin).origin === allowed`
  - **Effort**: Small (3 lines)

- [ ] **4.14** Limit webhook body size before reading
  - **File**: `apps/worker/src/index.ts:286`
  - Check `Content-Length` header before `c.req.raw.text()`, reject if > 64 KB
  - Protects against memory exhaustion from unauthenticated large bodies
  - **Effort**: Small (5 lines)

- [ ] **4.15** Restrict OAuth `returnTo` URL validation
  - **File**: `apps/worker/src/lib/whoop-oauth.ts:140-146`
  - Remove `http:` from allowed protocols
  - Validate `https:` URLs against a known-good hostname whitelist
  - Validate `strength:`, `exp:`, and `exps:` URLs to block path traversal injection
  - **Effort**: Small (~10 lines)

- [ ] **4.16** Add webhook nonce/jti tracking
  - **File**: `apps/worker/src/whoop/webhook.ts:48-95`
  - Extract event ID from payload, store in D1 with TTL (6 minutes to cover 5-min window + buffer)
  - Check for duplicate before processing each webhook
  - **Effort**: Medium (new table or reuse rate_limit pattern, ~20 lines)

---

## Dependency Order

```
Phase 1 (no deps)
├── 1.1 userId in WHERE clauses
├── 1.2 completedAt guard
├── 1.3 infinite loop
├── 1.4 totalSessionsCompleted race
├── 1.5 workout sync TOCTOU
├── 1.6 read-then-insert races (6 handlers)
├── 1.7 chat syncOperationId TOCTOU
├── 1.8 queue worker atomic status
├── 1.9 exercises unique constraint (needs new migration)
├── 1.10 wrap multi-step mutations in transactions
├── 1.11 concurrent WHOOP sync guard
├── 1.12 user preferences read-merge-write
├── 1.13 token lock (needs new migration)
├── 1.14 token refresh optimistic concurrency
├── 1.15 workout soft-delete cascade
└── 1.16 requireAuth return pattern

Phase 2
├── 2.1 WHOOP recovery date filter (no deps)
├── 2.2 LIMIT caps (no deps)
├── 2.3 WHOOP page cap (no deps)
├── 2.4 parseInt validation (no deps)
├── 2.5 external API timeouts (no deps)
├── 2.7 training snapshot limits (no deps)
├── 2.8 WHOOP sync memory (no deps)
├── 2.9 historical exercise bound (no deps)
├── 2.10 home summary LIMIT (interim, no deps)
├── 2.11 cap AI chat history (no deps)
├── 2.12 queue job AI timeout (no deps)
├── 2.13 cache Better Auth instance (no deps)
└── 2.6 home summary restructure (needs new migration, depends on 1.4)

Phase 3
├── 3.1 rate limiter upsert fix (depends on 3.2)
├── 3.2 rate limit schema sync (no deps)
└── 3.3 chunkedInsert timeout (no deps)

Phase 4 (depends on 3.1 for rate limiter, 3.2 for schema)
├── 4.1 rotate secrets (ops)
├── 4.2 body size limit
├── 4.3 image base64 validation
├── 4.4 security headers
├── 4.5 global rate limiting
├── 4.6 webhook rate limit user ID
├── 4.7 CORS dev hardening
├── 4.8 encryption key hardening
├── 4.9 remove IP/user-agent from /api/me
├── 4.10 program listing auth
├── 4.11 LIKE wildcard escaping
├── 4.12 Expo migration parameterization
├── 4.13 CORS exact origin matching
├── 4.14 webhook body size limit
├── 4.15 OAuth returnTo validation
└── 4.16 webhook nonce tracking
```

## Estimated Total Effort

| Phase | Items | Migrations | Size |
|-------|-------|------------|------|
| Phase 1 | 16 items | 2 migrations | ~320 lines across 17+ files |
| Phase 2 | 13 items | 1 migration (if materialized table) | ~160 lines + migration + recompute triggers |
| Phase 3 | 3 items | none | ~60 lines |
| Phase 4 | 16 items | none (1 new table for nonce tracking) | ~130 lines + ops |

---

## Questions to Resolve

1. **Token lock approach**: Confirm Option B (D1 lock table with TTL), or switch to A/C?
2. **Home summary restructure**: Materialized table (separate `home_summary` table) or a JSON column on `user`? Separate table is cleaner but more migration work.
3. **Rate limit per-endpoint values**: Suggested defaults (20/hr auth, 60/hr chat, 500/hr CRUD) — reasonable?
4. **Training snapshot**: Is the offline snapshot used by production clients now, or still in development? Limits might break functionality if clients expect unbounded data.
5. **Program listing endpoint**: Is `GET /api/programs` intentionally unauthenticated? If so, document the exception in AGENTS.md and keep it public. If not, add `createHandler` wrapper.

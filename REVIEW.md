# Security, Race Condition & Resource Analysis

## Critical

### 1. Missing `userId` in WHERE Clauses — TOCTOU Ownership Bypass

Three handlers check ownership via `requireOwnedRecord` or `requireOwnedProgramCycleWorkout`, then issue a mutation that only filters by `id`, not `userId`. If the row changes between the check and the mutation, another user's data can be affected.

- **`apps/worker/src/api/nutrition/entries.$id.ts:93-100`** — `deleteEntryHandler` calls `requireOwnedRecord` to verify ownership, but the subsequent `UPDATE ... SET isDeleted = true` only checks `id`, not `userId`. A concurrent reassignment could delete another user's entry.
- **`apps/worker/src/routes/program-cycles.ts:614-618`** — The schedule update relies on `requireOwnedProgramCycleWorkout`, but the final UPDATE only checks `cycleWorkoutId`, not ownership through the cycle.
- **`apps/worker/src/routes/workouts.ts:355-362`** — The workout delete nulls out `programCycleWorkouts.workoutId` without verifying those cycle workouts belong to the user.

**Fix**: Include `userId` in every mutation WHERE clause, not just the ownership check. For the workout delete, join through cycles to verify ownership.

---

### 2. Infinite Loop in Scheduler (`apps/worker/src/programs/scheduler.ts:94`)

```ts
while (!foundDate) {
  if (isGymDay(dateToCheck, options.preferredDays) && !scheduledDates.has(dateKey)) {
    foundDate = dateToCheck;
  } else {
    currentDate = addDays(currentDate, 1);
  }
}
```

**Trigger**: `preferredGymDays || ['monday', 'wednesday', 'friday']` at `routes/programs.ts:100` — an empty array is **truthy** in JavaScript (`[] || default` evaluates to `[]`). When `preferredDays` is `[]` or contains only invalid day names, `isGymDay()` always returns `false`, and the while loop runs forever, hanging the Worker until Cloudflare kills the isolate.

**Fix**: Add a max-iteration guard (e.g., 365 days) and/or fall back to any day. Also fix the truthiness check: `preferredGymDays?.length ? preferredGymDays : ['monday', 'wednesday', 'friday']`.

---

### 3. Workout Complete Endpoint Can Skip Program Sessions (`apps/worker/src/routes/workouts.ts:694-728`)

`PUT /:id/complete` does not check if `completedAt` is already set. Each call re-sets `completedAt` and calls `advanceProgramCycleForWorkout`, which advances the program cycle again. A user (or buggy client) can skip through an entire program by calling this endpoint repeatedly.

**Fix**: Add a guard: if `completedAt` is already set, return early (idempotent). Only advance the program cycle on the first completion.

---

### 4. Read-Modify-Write Race on `totalSessionsCompleted`

Two locations:
- `apps/worker/src/routes/program-cycles.ts:496-497` (`complete-session`)
- `apps/worker/src/lib/program-helpers.ts:616` (`advanceProgramCycleForWorkout`)

Both read `totalSessionsCompleted` into JavaScript, increment by 1, then write it back. Two concurrent calls see the same old value and skip a session.

**Fix**: Use `sql`totalSessionsCompleted + 1`` for atomic DB-level increment:
```ts
await db.update(schema.userProgramCycles)
  .set({ totalSessionsCompleted: sql`totalSessionsCompleted + 1` })
  .where(eq(schema.userProgramCycles.id, cycleId));
```

---

### 5. TOCTOU Idempotency Gap in Workout Sync (`apps/worker/src/routes/workouts.ts:398-649`)

```ts
// STEP 1: Check if operation already exists (line 398)
const existingOperation = await db.select()...where(...).get();
if (existingOperation) { return c.json(...); }

// STEP 2: Hundreds of lines of mutations (delete/insert exercises and sets)
// ...

// STEP 3: Record operation as applied (line 649)
await db.insert(schema.workoutSyncOperations).values({...}).run();
```

The SELECT check and the INSERT are not in a transaction. Two concurrent sync requests both pass the check, both perform all the destructive mutations (deleting and re-inserting exercises and sets), and then the UNIQUE constraint catches the duplicate INSERT — but the data has already been mutated twice.

**Fix**: Use `INSERT ... ON CONFLICT DO NOTHING` (or `onConflictDoNothing()` in Drizzle) at the start of the handler, and check `rowsAffected` to determine if the operation was already applied. If 0 rows affected, return the existing result without running mutations.

---

### 6. WHOOP Recovery Query Missing Date Filter (`apps/worker/src/routes/whoop.ts:211-215`)

```ts
db.select().from(whoopRecovery)
  .where(eq(whoopRecovery.userId, userId))
  .orderBy(desc(whoopRecovery.date)),
```

The recovery query has no `gt(start, since)` date filter, while sleep (line 219), cycles (line 224), and workouts (line 229) all do. This returns **ALL recovery records ever stored** for the user, unbounded.

**Fix**: Add `gt(whoopRecovery.date, since)` to the recovery query.

---

### 7. Hardcoded Secrets in `wrangler.toml` on Disk (`apps/worker/wrangler.toml`)

The generated `wrangler.toml` contains plaintext API keys, BETTER_AUTH_SECRET, ENCRYPTION_MASTER_KEY, WHOOP credentials, Google OAuth credentials, and CF tokens. While gitignored (confirmed in `.gitignore`), it exists in plaintext on every developer's machine and CI build artifacts. Any compromise of a developer workstation leaks all production secrets.

**Fix**: Use `wrangler secret put` for all sensitive values instead of plaintext in the generated config. Rotate any secrets that have been committed or present on developer machines.

---

### 52. Cryptographic Key Reuse — `BETTER_AUTH_SECRET` as WHOOP HMAC Key (`apps/worker/src/lib/whoop-oauth.ts:18-28`)

`BETTER_AUTH_SECRET` is used as the HMAC-SHA256 key for signing WHOOP OAuth state tokens (`signWhoopState`), while simultaneously serving as Better Auth's primary signing secret for JWTs and session tokens. Key reuse means compromise of either context breaks both simultaneously.

**Fix**: Derive a separate WHOOP state signing key from `BETTER_AUTH_SECRET` using HKDF with a domain-specific salt (`whoop-oauth-state-v1`).

---

### 53. Silent Token Corruption via Decrypt-Fallback (`apps/worker/src/whoop/token-rotation.ts:58-72`)

```ts
try { accessToken = await decryptToken(integration.accessToken, encryptionKey); }
catch { accessToken = integration.accessToken; }  // ciphertext treated as plaintext
```

If `ENCRYPTION_MASTER_KEY` is rotated or misconfigured, all encrypted tokens fail decryption and the fallback treats ciphertext bytes as the plaintext token. The subsequent refresh uses these fake tokens against WHOOP (fails), then re-encrypts the ciphertext-turned-plaintext — permanently overwriting the real encrypted token. **Irreversible data loss** requiring WHOOP re-auth.

**Fix**: Remove the fallback. Fail loud on decryption error. If a plaintext-to-encrypted migration is needed, add an explicit `encryptionVersion` column.

---

## High

### 8. No Unique Constraint on `(userId, name)` for Custom Exercises (`packages/db/src/schema.ts:83-101`, `packages/db/src/program/exercise.ts:108-124`)

The exercises table has `unique('exercises_user_id_library_id_unique').on(t.userId, t.libraryId)` but no unique constraint on `(userId, name)`. `getOrCreateExerciseForUser` handles library exercises with `onConflictDoUpdate` (safe), but custom exercises (no libraryId) are inserted with a bare `.insert().returning().get()` — if two concurrent requests create the same custom exercise, both pass the SELECT name check (line 68-76) and both insert, creating duplicates.

**Fix**: Add a unique index on `(userId, lower(name))` (SQLite function index like the existing `idx_exercises_user_deleted_lower_name`) or add a `onConflictDoNothing` with a fallback SELECT.

---

### 9. Multiple Read-Then-Insert Patterns Without Transactions — Unsafe Under Concurrency

These patterns SELECT to check existence, then INSERT if not found. Under concurrent requests, both pass the check and both insert, causing duplicate rows or unhandled constraint errors.

- **`apps/worker/src/lib/program-helpers.ts:199-266`** (`createOneRMTestWorkout`)
- **`apps/worker/src/lib/program-helpers.ts:458-529`** (`startCycleWorkout`)
- **`apps/worker/src/lib/program-helpers.ts:645-691`** (`resolveToUserExerciseId`) — unhandled constraint error
- **`apps/worker/src/api/nutrition/body-stats.ts:32-74`** (`upsertBodyStatsHandler`)
- **`apps/worker/src/api/nutrition/training-context.ts:31-69`** (`upsertTrainingContextHandler`)
- **`apps/worker/src/routes/profile.ts:25-45`** (profile preferences creation)

**Fix**: Replace SELECT-then-INSERT with `INSERT ... ON CONFLICT DO NOTHING` + `rowsAffected` check, or `ON CONFLICT DO UPDATE` (upsert). For `resolveToUserExerciseId`, add a try/catch around the INSERT with a fallback to SELECT.

---

### 10. Multi-Step Non-Transactional Operations

Multiple handlers perform several sequential DB mutations without a transaction — partial failure leaves inconsistent state.

- **`apps/worker/src/routes/templates.ts:140-415`** — Template update and template copy do multiple INSERT/UPDATE operations without a transaction wrapper. If a template copy fails mid-way, partially created template_exercises rows are orphaned.
- **`apps/worker/src/routes/program-cycles.ts:158-389`** — Program cycle update and 1RM test update perform multiple reads and writes. Partial failure leaves the cycle in an inconsistent state.
- **`apps/worker/src/lib/program-helpers.ts:259,453`** — `db.batch()` is not transactional on D1. If a batch fails partway through, previous statements are committed.

**Fix**: Wrap multi-step mutations in `db.transaction()` for atomicity. Replace `db.batch()` with `db.transaction()` where atomicity is required.

---

### 11. Home Summary — Excessive Work Per Request (`apps/worker/src/api/home/summary.ts:117-432`)

Runs on every app open. Does 10+ sequential DB round trips including:
- All active cycles unbounded (line 135)
- All cycle workouts unbounded (line 174)
- 365 days of workout dates unbounded (line 326) for streak calculation

**Fix**: Add limits, combine queries where possible, and consider a materialized summary table updated on workout completion instead of scanning 365 days of data on every home screen load.

---

### 12. Training Offline Snapshot — Unbounded Data Dump (`apps/worker/src/routes/training.ts:99-120`)

Loads all templates, all exercises, all cycles, and up to 200 recent workouts with all exercises and sets. Uses N+1 query pattern for cycle workouts. A single request can return 3,600+ rows.

**Fix**: Add per-entity limits and use a single JOIN query for cycles+workouts instead of the N+1 loop.

---

### 13. WHOOP Data Endpoint Returns Unbounded Result Sets (`apps/worker/src/routes/whoop.ts:210-231`)

Recovery, sleep, cycles, and workouts queries have no LIMIT. A user with a year of WHOOP data could cause the worker to fetch and serialize thousands of rows per request, hitting memory/CPU limits.

**Fix**: Add LIMIT to each query (e.g., 100 per data type).

---

### 14. WHOOP Collection Sync Fetches All Pages Unconditionally (`apps/worker/src/whoop/api.ts:162-191`)

`fetchWhopCollection` loops through `next_token` until exhaustion with no page count limit or early termination. For an initial 365-day sync, this could fetch hundreds of pages across 5 categories, exhausting Cloudflare's 50 subrequest limit.

**Fix**: Add a maximum page count (e.g., 50 pages per category) with a warning/error if exceeded.

---

### 15. Workout List Limit Has No Upper Bound (`apps/worker/src/routes/workouts.ts:89-106`)

`limit` comes from `c.req.query('limit')` with no upper cap. `?limit=1000000` will attempt to return that many workouts.

**Fix**: Clamp limit to a maximum (e.g., 100).

---

### 16. CORS `startsWith` Prefix Match Allows Subdomain Bypass in Production (`apps/worker/src/index.ts:92`)

```ts
// production CORS check (line 92)
for (const allowed of strictAllowed) {
  if (origin.startsWith(allowed)) {
    return origin;  // ❌ prefix match, not exact
  }
}
// getAllowedOrigins() returns ['strength://', 'exp://', baseURLOrigin]
```

`origin.startsWith(allowed)` means `https://strength.example.com.evil.com` matches the allowed origin `https://strength.example.com`. The `strength://` custom scheme prefix also matches `strength://evil.com`. With `credentials: true`, cookies are sent to matching origins.

**Fix**: Use exact string comparison or proper URL origin parsing (`new URL(origin).origin === allowed`) instead of `startsWith`.

---

### 54. No PKCE in WHOOP OAuth Flow — Mobile Authorization Code Interception (`apps/worker/src/whoop/auth.ts:17-31`)

The WHOOP OAuth flow uses `authorization_code` grant with an HMAC-signed state parameter but no PKCE (Proof Key for Code Exchange). On mobile, the custom URL scheme `strength://` can be intercepted by malicious apps. Without PKCE, a stolen authorization code can be exchanged for tokens by anyone — the state HMAC only prevents CSRF, not code theft.

**Fix**: Generate a `code_verifier` (cryptographically random), compute SHA-256 hash as `code_challenge`, include `code_challenge` + `code_challenge_method=S256` in the authorization URL, and send `code_verifier` in the token exchange request.

---

### 55. `expo-origin` Header Spoofing Bypasses Origin Validation (`apps/worker/src/api/auth.ts:31-41`)

`getAuthHeaders` trusts the client-provided `expo-origin` header to set the HTTP `origin` header, which Better Auth uses for `trustedOrigins` validation. Any client can set `expo-origin` to an arbitrary value. The server cannot distinguish a legitimate native client from a spoofed one.

**Fix**: Do not trust client-provided `expo-origin` as an origin replacement. For native clients lacking a standard `Origin` header, use the worker's configured base URL as the trusted origin instead.

---

### 56. Custom URL Scheme Host Validation Missing in OAuth `returnTo` (`apps/worker/src/lib/whoop-oauth.ts:140-146`)

`isAllowedWhoopReturnTo` validates only the URL protocol, not the host: `strength://evil.com/whoop-callback?code=...` is accepted. On Android, any app can register for a custom URL scheme — no namespace protection. A malicious app registered for `strength://` can intercept OAuth callbacks containing the authorization code. (The `http:` protocol issue is covered by #31; this is about the custom scheme portion.)

**Fix**: For custom schemes, validate the hostname/path. For `https:`, validate against a known-good hostname whitelist. Consider Android App Links or iOS Universal Links for OAuth redirects.

---

### 57. Stale `ownedSet` During Workout Sync-Complete Exercise Resolution (`apps/worker/src/routes/workouts.ts:526-567`)

`POST /:id/sync-complete` batch-checks exercise ownership into an `ownedSet`, then resolves each exercise individually. Between the batch check and resolution, a concurrent `DELETE /api/exercises/:id` can soft-delete an exercise. The stale `ownedSet` still considers it owned, and the resolver skips re-creation — yielding a `workoutExercise` referencing a soft-deleted exercise.

**Fix**: Re-verify `isDeleted = false` after resolving all exercises, or eliminate the batch check and use `INSERT ... ON CONFLICT (userId, libraryId) DO UPDATE ... RETURNING id` for all exercises (atomic).

---

### 58. Soft-Delete FK Cascade Gap with Concurrent Child Inserts (`packages/db/src/schema.ts`, `apps/worker/src/routes/templates.ts:259-321`, `apps/worker/src/routes/workouts.ts:150-158`)

The schema defines `ON DELETE CASCADE` on foreign keys (`templateExercises → templates`, `workoutExercises → workouts`, etc.), but the app uses soft-deletes (UPDATE SET `isDeleted = true`). `CASCADE` only fires on physical `DELETE`. Concurrent soft-delete of a parent + INSERT of a child creates orphaned references — e.g., a `templateExercise` pointing to a soft-deleted exercise. Queries that don't filter through the parent's `isDeleted` flag surface these orphans.

**Fix**: In child-insert handlers, re-verify `isDeleted = false` on the parent within the same transaction. Or add `AND parent.isDeleted = false` to all JOIN queries referencing soft-deletable parents.

---

### 59. Sessions Not Invalidated on Password Change (`apps/worker/src/auth.ts:198-238`)

Better Auth sets session expiry to 10 days. There is no custom handler that invalidates existing sessions when a user changes their password. A compromised session token remains valid for up to 10 days after password reset.

**Fix**: Verify Better Auth v1.6.9+ behavior. If sessions are not auto-invalidated on password change, add a hook or middleware that deletes all sessions for the user on password change, or add a `passwordChangedAt` column and reject sessions created before that timestamp.

---

## Medium

### 17. In-Memory Token Refresh Lock Unsafe Across Cloudflare Workers (`apps/worker/src/whoop/token-rotation.ts:20`)

```ts
const refreshLocks = new Map<string, Promise<string>>();
```

A per-isolate `Map` is used as a mutex to prevent concurrent WHOOP token refreshes. Cloudflare Workers run in multiple V8 isolates across colos. Two concurrent requests at different isolates both see the lock as empty, both refresh the token, and the second writer overwrites the first with an already-consumed refresh token, permanently breaking WHOOP integration.

Also: hung promises are never evicted from the Map (no TTL), so a crashed refresh locks that integration indefinitely.

**Fix**: Use D1 as the coordination layer (e.g., a `token_refresh_lock` table with a TTL, or optimistic concurrency on `user_integration.updatedAt`). See `TODO_REVIEW.md` for approach comparison.

---

### 18. Nutrition Chat Queue — No Atomic Status Transition (`apps/worker/src/api/nutrition/chat.ts:471-484`)

```ts
const job = await db.select()...where(...).get();
if (!job || job.status === 'completed') return;
await db.update(schema.nutritionChatJobs)
  .set({ status: 'processing', ... })
  .where(eq(schema.nutritionChatJobs.id, job.id));
```

Cloudflare Queues guarantee at-least-once delivery. If a message is redelivered, two workers can both pass the `status !== 'completed'` check.

**Fix**: Use a conditional UPDATE: `UPDATE ... SET status = 'processing' WHERE id = ? AND status = 'pending'` and check `rowsAffected`.

---

### 19. Nutrition Chat — TOCTOU on `syncOperationId` (`apps/worker/src/api/nutrition/chat.ts:378-392`)

Same check-then-insert pattern as workout sync. The unique constraint catches the duplicate INSERT, but the user message was already inserted at line 395, creating an orphaned message with no job.

**Fix**: Use `onConflictDoNothing()` INSERT and check rowsAffected, or wrap in a transaction.

---

### 20. Rate Limiter Has Insert-Or-Update Race (`apps/worker/src/lib/rate-limit.ts`)

Uses INSERT → catch unique violation → SELECT → UPDATE. Between the SELECT and UPDATE, another request can modify the row, causing the optimistic concurrency check to fail and retry. Under high concurrency, requests can slip past the limit.

**Fix**: Replace the catch-then-select pattern with a single upsert using `onConflictDoUpdate`:
```ts
db.insert(schema.rateLimit).values({...})
  .onConflictDoUpdate({
    target: [schema.rateLimit.userId, schema.rateLimit.endpoint],
    set: { requests: sql`CASE WHEN requests < limit THEN requests + 1 ELSE requests END`, ... }
  })
```

---

### 21. Whoop Sync — High Peak Memory (`apps/worker/src/whoop/sync.ts:777-818`)

Fetches all 5 WHOOP data categories in parallel via `Promise.all`, holding 365 days x 5 categories of JSON in memory simultaneously before writing to D1 (~5 MB peak).

**Fix**: Fetch and process each category sequentially to reduce peak memory by ~80%.

---

### 22. Concurrent WHOOP Sync Duplicates Work (`apps/worker/src/whoop/sync.ts:709-855`)

`syncAllWhoopData` has no guard to prevent two concurrent sync-all requests from duplicating all work. Both fetch the same data from WHOOP API, both upsert the same rows (harmless but wasteful), and both make redundant external API calls.

**Fix**: Add a status column or lock to `user_integration` (e.g., `sync_status`) to prevent concurrent syncs.

---

### 23. Unbounded Exercise Search (`apps/worker/src/routes/exercises.ts:10-33`)

The search query returns all matching exercises with no LIMIT.

**Fix**: Add LIMIT (e.g., 50).

---

### 24. Unbounded Nutrition Entries Per Day (`apps/worker/src/api/nutrition/entries.ts:7-40`)

Returns ALL nutrition entries for the requested day with no pagination or max limit.

**Fix**: Add LIMIT or cursor-based pagination.

---

### 25. `getLastCompletedExerciseSnapshots` — Unbounded Historical Query (`apps/worker/src/lib/program-helpers.ts:769`)

Loads ALL historical workout exercises for the given exercise IDs with no date or row limit. Called on every workout start from a template.

**Fix**: Add a LIMIT or date-range filter (e.g., last 90 days).

---

### 26. D1 Batch Insert Has No Timeout (`packages/db/src/utils/d1-batch.ts:165-187`)

`chunkedInsert` batches up to 45 statements at a time. If called with a huge number of rows (e.g., a malicious sync-complete payload near the 400-set limit), it generates many batch rounds without any timeout or cancellation.

**Fix**: Add a configurable timeout or maximum round guard.

---

### 27. External API Calls Have No Timeouts

- **`apps/worker/src/whoop/api.ts:143`** — `fetchWhoopJson` has no AbortController timeout
- **`apps/worker/src/whoop/auth.ts:48,79`** — WHOOP OAuth token exchange has no timeout
- **`apps/worker/src/api/nutrition/chat.ts:279`** — AI model `generateText` call has no timeout (may have SDK default, but no explicit limit)

**Fix**: Add `AbortController` with reasonable timeouts (e.g., 10s for WHOOP API, 30s for AI generation).

---

### 28. User Preferences PUT Read-Merge-Write Race (`apps/worker/src/routes/profile.ts:57-136`)

The PUT handler reads existing preferences into memory, merges with the request body values, then writes back. Two concurrent PUTs overwrite each other — the second writer's changes erase the first's.

**Fix**: Use `onConflictDoUpdate` upsert for individual fields, or add an `updatedAt` optimistic concurrency check with retry.

---

### 29. Unauthenticated Program Listing Endpoint (`apps/worker/src/routes/programs.ts:23`)

```ts
router.get('/', async (c) => {
  const { PROGRAMS } = await import('../programs');
  ...
});
```

The program list endpoint has no `createHandler` wrapper and no auth check. While it returns only static program metadata (not user data), it violates the stated "auth enforced on all protected API routes" policy per `AGENTS.md`. If this is intentional, the policy should be updated; if not, it should be protected.

**Fix**: Add `createHandler` wrapper if this should be protected, or document the exception.

---

### 30. Webhook Reads Full Body Before Signature Validation (`apps/worker/src/index.ts:286`)

```ts
const rawBody = await c.req.raw.text();  // reads entire body into memory
const isValid = await verifyWebhookSignature(c.env, timestamp, signature, rawBody);
```

The entire request body is read into a string before the HMAC signature is verified. An attacker can send arbitrarily large unauthenticated bodies to exhaust Worker memory before authentication even runs.

**Fix**: Check `Content-Length` header before reading body; cap at a reasonable limit (e.g., 64 KB for webhook payloads). Reject oversized requests before reading the body.

---

### 31. OAuth `returnTo` Allows `http:` and `https:` URLs (`apps/worker/src/lib/whoop-oauth.ts:140-146`)

```ts
return ['strength:', 'exp:', 'exps:', 'http:', 'https:'].includes(url.protocol);
```

The `isAllowedWhoopReturnTo` function only validates the URL protocol, not the hostname or path. An attacker can engineer an OAuth redirect to `https://evil.com/phishing` or `http://malicious.com`. The `http:` allowance is particularly dangerous — unencrypted redirects allow MITM interception of the OAuth state token.

**Fix**: Remove `http:` from allowed protocols. Validate `https:` URLs against a whitelist of known-good hostnames, or at minimum block obviously malicious patterns.

---

### 32. Soft-Delete Workout Doesn't Cascade to `workoutExercises`/`workoutSets` (`apps/worker/src/routes/workouts.ts:344-365`)

The DELETE handler only sets `isDeleted: true` on the workout row (and nulls out `programCycleWorkouts.workoutId`). The related `workout_exercises` and `workout_sets` rows are not soft-deleted. If any query joins directly to these tables without checking the parent workout's `isDeleted` flag, orphaned child rows remain visible.

**Fix**: Either soft-delete children in the same handler, or ensure all queries that join to `workout_exercises`/`workout_sets` filter through the parent workout's `isDeleted` flag.

---

### 33. `requireAuth` Returns `null` Instead of Throwing (`apps/worker/src/api/auth.ts:67-71`)

```ts
export async function requireAuth(c: any) {
  const resolvedSession = await loadAuthSession(c);
  if (!resolvedSession) {
    return { user: null, session: null };  // ❌ returns null tuple
  }
  return resolvedSession;
}
```

If a handler uses `requireAuth` directly (not `requireAuthContext` or `createHandler`) and forgets to check for null, it proceeds with `userId: undefined`, potentially querying data for `userId = undefined`. Most handlers use `createHandler` which calls `requireAuthContext` (safe), but the pattern is a footgun.

**Fix**: Return `undefined` (which forces a check) or throw an error, and document that `requireAuth` may return null.

---

### 34. Token Refresh UPDATE Lacks Optimistic Concurrency (`apps/worker/src/whoop/token-rotation.ts:107-115`)

```ts
await db.update(userIntegration)
  .set({ accessToken: ..., refreshToken: ..., ... })
  .where(eq(userIntegration.id, integration.id));  // ❌ no version/updatedAt check
```

Even if the per-isolate lock issue (#16) is fixed, the UPDATE itself has no `WHERE updatedAt = oldUpdatedAt` guard. Two concurrent refreshes that both read the same `integration` object will both write, and the second write overwrites the first with potentially stale or already-consumed tokens.

**Fix**: Add `eq(userIntegration.updatedAt, integration.updatedAt)` to the WHERE clause, and check rowsAffected. If 0, the token was already refreshed by another request — re-read and return.

---

### 35. Entire Chat History Sent to AI Model with No Cap (`apps/worker/src/api/nutrition/chat.ts:271`)

```ts
const priorMessages = messages.slice(0, -1).map(compactNutritionChatHistoryMessage);
const aiMessages = [...priorMessages, userMessage];
```

All prior chat messages for the day are sent to the AI model with no token count limit or message count cap. A long conversation could exceed the model's context window (causing errors) or incur excessive AI generation costs from the large prompt.

**Fix**: Cap the number of prior messages (e.g., last 20) or estimate token count and trim from the oldest messages until within a budget (e.g., 4K tokens for context).

---

### 36. Queue Job Has No Timeout on AI Model Call (`apps/worker/src/api/nutrition/chat.ts:279-283`)

```ts
const result = await generateText({ model, system: combinedSystemPrompt, messages: aiMessages });
```

No `AbortController` timeout on the AI generation call in the queue worker. If the AI model hangs or takes excessively long, the Worker CPU time is consumed, and the queue message may be retried (creating duplicate processing).

**Fix**: Add an `AbortController` with a timeout (e.g., 30s) to the `generateText` call. On timeout, mark the job as `failed` so it isn't retried.

---

### 37. Webhook Lacks Nonce/JTI Tracking (`apps/worker/src/whoop/webhook.ts:48-95`)

The webhook signature verification checks the HMAC and timestamp window (5 minutes), but doesn't track nonces or JTI values. A valid signed webhook request can be replayed at any time within the 5-minute window.

**Fix**: Extract and store a nonce from the webhook payload (e.g., `event.id` or `event.timestamp` combined with `event.type`). Check against a short-lived cache (D1 or in-memory) before processing. Reject replayed nonces.

---

### 38. Rate Limit Check Performs Up to 4 DB Queries per Request (`apps/worker/src/lib/rate-limit.ts:29-141`)

The worst-case path through `checkRateLimit`: INSERT → catch → SELECT → UPDATE → SELECT re-read. That's 4 sequential D1 round trips on every rate-limited request. Combined with the middleware's `populateAuthContext` (which also queries D1 for the session), a single rate-limited request can make 5+ DB queries before reaching the handler.

**Fix**: Consolidate into a single upsert (see #19 fix). The re-read SELECT after increment could use `returning()` to avoid the extra round trip.

---

### 39. New Better Auth Instance Created on Every Request (`apps/worker/src/api/auth.ts:43-46`)

```ts
export function getAuth(c: any) {
  const headers = getAuthHeaders(c);
  const origin = headers.get('origin') ?? undefined;
  return createAuth(c.env as WorkerEnv, headers, origin);  // new instance every call
}
```

`createAuth` is called by `loadAuthSession` (on every request via `populateAuthContext`) and by `getAuth` (used by `requireAuth` fallback). Each call creates a new Better Auth instance with Drizzle adapter, configuration parsing, etc. Under load this is wasteful.

**Fix**: Cache the Better Auth instance per request context (it's already request-scoped). For sessions, use a lightweight lookup directly on the `session` table via Drizzle instead of instantiating full Better Auth.

---

### 60. No CSRF Protection on State-Changing API Endpoints

All POST, PUT, and DELETE endpoints rely solely on the session cookie via `credentials: 'include'`. There is no CSRF token, double-submit cookie, or `Origin`/`Referer` validation on any custom API route. With `credentials: true`, the browser sends the session cookie on cross-origin requests to matching origins. CORS alone does not prevent CSRF.

**Fix**: Implement double-submit cookie CSRF pattern: set a `csrf_token` cookie, require the client to send it as `X-CSRF-Token` header, validate server-side. Alternatively, validate `Origin`/`Referer` against the worker's base URL for all mutating requests.

---

### 61. No Input Range Validation on Nutrition and Body Stats Numeric Fields (`apps/worker/src/api/nutrition/entries.ts:53-63`, `apps/worker/src/api/nutrition/body-stats.ts:15-24`)

Nutrition entries accept arbitrary numeric values without bounds: negative values, extreme values (e.g., `calories: -999999999`). These flow into macro calculations and AI prompts, producing NaN/Infinity or absurd responses.

**Fix**: Add range validation (e.g., `calories: 0-50000`, `proteinG: 0-1000`, `bodyweightKg: 0-500`). Return 400 for out-of-range values.

---

### 62. `complete-session` Endpoint Lacks Already-Completed Guard (`apps/worker/src/routes/program-cycles.ts:487-551`)

`POST /cycles/:id/complete-session` has no check for `isComplete === true` or `status === 'completed'`. If called on a completed cycle, `newSessionsCompleted` exceeds `totalSessionsPlanned`, the next workout lookup returns `undefined`, and `totalSessionsCompleted` is inflated beyond the planned total — corrupting progress tracking. Distinct from #3 (workout complete) and #4 (read-modify-write).

**Fix**: Add early-return guard: `if (cycleData.isComplete) return c.json({ message: 'Cycle already completed' }, 409)`. Add bounds check on `newSessionsCompleted`.

---

### 63. Assistant Chat Message Orphaned on Job Failure (`apps/worker/src/api/nutrition/chat.ts:279-294, 469-527`)

`generateNutritionChatAssistantContent` inserts the assistant message into `nutritionChatMessages` BEFORE returning. If the subsequent job status update fails (content validation, D1 error), the catch block marks the job as `failed`, but the assistant message is already persisted with no link. On queue retry (at-least-once delivery), the AI is called again and inserts a second message — the first is orphaned permanently.

**Fix**: Restructure: return content without inserting. Insert the assistant message only after all validation passes, in the same step as the job completion update.

---

### 64. Image Rate Limit Check Has TOCTOU Gap (`apps/worker/src/api/nutrition/chat.ts:66-88, 395-401`)

`validateImageRateLimit` counts images → returns `true`/`false`. The check happens before the user message INSERT. Two concurrent requests both pass the count check, both insert image messages, exceeding the 50-image daily limit.

**Fix**: Use an atomic INSERT with a conditional subquery: `INSERT INTO ... SELECT ... WHERE (SELECT COUNT(*) ... WHERE has_image = 1 AND ...) < 50`. Or document as a soft limit.

---

### 65. WHOOP Webhook Produces Brief Sleep-Recovery Inconsistency (`apps/worker/src/whoop/webhook.ts:116-132`)

On `recovery.updated` webhook, sleep is upserted first, then recovery is fetched and upserted. A concurrent read between the two upserts sees updated sleep paired with old recovery — producing inconsistent health insights.

**Fix**: Wrap both upserts in a D1 transaction.

---

### 66. `completeProgramCycle` Lacks `WHERE isComplete = false` Guard (`apps/worker/src/lib/program-helpers.ts:307-321`)

The UPDATE has no `AND isComplete = false` or `AND status = 'active'` guard. Two concurrent completions of the final workout both call it and both proceed to the `totalSessionsCompleted + 1` increment — the second should be blocked from even attempting it.

**Fix**: Add `eq(userProgramCycles.isComplete, false)` and `eq(userProgramCycles.status, 'active')` to the WHERE clause. Check `rowsAffected` in the caller and skip the increment if 0.

---

### 67. `advanceProgramCycleForWorkout` Lacks `WHERE isComplete = false` on Cycle Workout Update (`apps/worker/src/lib/program-helpers.ts:573, 603-610`)

The read check `linkedCycleWorkout.isComplete` at line 573 provides no concurrency protection — the UPDATE at lines 603-610 sets `isComplete: true` with only `WHERE id = ?`. Two concurrent calls both pass the read check, both run the UPDATE, both proceed to increment `totalSessionsCompleted`.

**Fix**: Add `eq(programCycleWorkouts.isComplete, false)` to the UPDATE WHERE and check `rowsAffected`. If 0, another request already completed it.

---

### 68. WHOOP `rawData` TEXT Columns Store Full API Responses — Never Pruned (`packages/db/src/schema.ts:362,404,431,463,482`)

Every WHOOP record stores its complete raw API JSON in a `rawData` TEXT column. An initial 365-day sync accumulates multiple megabytes per user. Never cleaned up. D1 charges by storage and rows-read.

**Fix**: Either drop `rawData` columns (store only typed fields), periodically nullify `rawData` for records >30 days old, or store in R2 with a reference key.

---

### 69. Missing Database Indexes on High-Traffic Query Patterns (`packages/db/src/schema.ts`)

- **`session.userId`** (FK, no index) — queried on every authenticated request via Better Auth
- **`nutritionEntries(userId, isDeleted, loggedAt)`** — two separate indexes force SQLite to use only one, table-scanning the second filter. Replace with a single composite index.
- **`workouts(userId, completedAt)`** — home summary streak queries filter on `completedAt BETWEEN ? AND ?` with no composite index.
- **`nutritionChatMessages(userId, createdAt)`** — chat history has no covering index.

**Fix**: Add `idx_session_user_id`, composite `idx_nutrition_entries_query(userId, isDeleted, loggedAt)`, `idx_workouts_user_id_completed_at`, `idx_nutrition_chat_messages_user_id_created_at`.

---

### 70. `inArray` in `getLastCompletedExerciseSnapshots` Can Exceed D1 Bound Parameter Limit (`apps/worker/src/lib/program-helpers.ts:779,823`)

`inArray(...)` passes all resolved exercise IDs directly into a single query. D1 has a bound parameter limit of ~100. With 150 exercise IDs, the query fails. The codebase already has `chunkedQueryMany` but doesn't use it here.

**Fix**: Use `chunkedQueryMany` to split `inArray` calls into safe batch sizes.

---

### 71. N+1 Query in `listActiveProgramCyclesForSnapshot` (`apps/worker/src/routes/training.ts:99-120`)

Fetches all active cycles, then loops calling `getProgramCycleWithWorkouts` — one query per cycle. With 5 programs, that's 1+5=6 DB round trips.

**Fix**: Use a single `inArray` query to batch-fetch all cycle workouts, group by `cycleId` in JavaScript.

---

### 72. No `Cache-Control` Headers on Any API Response

No endpoint sets `Cache-Control`. Read-heavy endpoints (`GET /api/exercises`, `GET /api/templates`, `GET /api/home/summary`) get no client or CDN caching benefit.

**Fix**: Add `Cache-Control: private, max-age=30` to read-heavy GET endpoints. Add a response middleware for consistent defaults.

---

## Low / Latent

### 40. Nutrition Chat Stores Unbounded Image Base64 in D1 (`apps/worker/src/api/nutrition/chat.ts:405-416`)

`imageBase64` from the request is persisted directly in `nutritionChatJobs` with no size validation. A malicious user could submit multi-megabyte base64 strings and fill D1 storage.

**Fix**: Validate imageBase64 size before storing (e.g., max 500KB). Reject oversized images at the API level.

---

### 41. No Global Request Body Size Limit

There is no global request body size limit configured in Hono. Endpoints like `POST /api/workouts` or `POST /api/nutrition/entries` could receive arbitrarily large JSON payloads.

**Fix**: Configure Hono's body size limit (e.g., 1 MB) globally.

---

### 42. CORS Allows Overly Broad Origins in Development (`apps/worker/src/index.ts:67-68`)

The dev CORS regex allows all RFC 1918 private IP ranges. If `APP_ENV=development` is ever accidentally set in a deployed environment, this becomes a significant security issue.

**Fix**: Add an environment guard so CORS dev origins are only active when `APP_ENV !== 'production'` AND not in a Cloudflare environment (check `c.env.CF` or `c.req.header('cf-connecting-ip')`).

---

### 43. Rate Limit TypeScript Schema Out of Sync (`packages/db/src/schema.ts:488-498`)

The TypeScript schema for the `rateLimit` table lacks the `unique('rate_limit_user_id_endpoint_unique')` extras callback that migration `0008_rate_limit_unique_constraint.sql` adds to the actual DB. Functionally works because the catch handler in `rate-limit.ts:42-46` catches `SQLITE_CONSTRAINT`, but Drizzle doesn't know about the constraint for query optimization.

**Fix**: Add `unique('rate_limit_user_id_endpoint_unique').on(rateLimit.userId, rateLimit.endpoint)` to the table extras in `schema.ts`.

---

### 44. Missing Security Headers

No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy headers are set. The `/connect-whoop` HTML page has no CSP. Mitigated because the app is primarily a native mobile app, not a browser-based SPA.

**Fix**: Add a security headers middleware for all routes.

---

### 45. No Global Rate Limiter

Rate limiting is only applied to 3 endpoints (WHOOP callback, WHOOP webhook, nutrition chat). Auth endpoints (login, signup, password reset) and all CRUD routes are unthrottled.

**Fix**: Apply rate limiting as global middleware on `/api/*`.

---

### 46. WHOOP Webhook Rate-Limited on External User ID (`apps/worker/src/index.ts:301-309`)

The webhook handler rate-limits by WHOOP's external user ID (`event.userId`) rather than the app's internal user ID (resolved later at line 139). Rate limit is per-WHOOP-account rather than per-app-user.

**Fix**: Resolve the app user ID first (or use the webhook secret's configured user), then rate-limit by app user ID.

---

### 47. Encryption Master Key Falls Back to Raw UTF-8 String (`apps/worker/src/utils/crypto.ts:45-50`)

`decodeMasterKey` falls through to `decodeUtf8Key` if base64/hex decoding fails, meaning any plaintext string becomes a valid AES key. This is acceptable if intentional, but weak passphrases will produce weak keys via UTF-8 encoding.

**Fix**: If the key is intentionally UTF-8, ensure minimum length (e.g., 32 bytes). Otherwise, require base64 or hex encoding and fail on invalid format.

---

### 48. IP Address + User Agent Exposed via `/api/me` (`apps/worker/src/routes/health.ts:38-39`)

```ts
return c.json({ user: safeUser, session: safeSession });
```
`safeSession` includes `ipAddress` and `userAgent` from the session table. This exposes Better Auth tracking data to any authenticated client.

**Fix**: Remove `ipAddress` and `userAgent` from the response, or restrict to admin-only.

---

### 49. SQL String Interpolation in Expo Local Migrations (`apps/expo/db/migrations.ts:240,255`)

```ts
`SELECT id FROM local_schema_migrations WHERE id = '${id}' LIMIT 1`
`INSERT OR REPLACE INTO local_schema_migrations (id, applied_at) VALUES ('${id}', ${Date.now()})`
```

Uses `${id}` directly in SQL strings. Currently safe because `id` is always a hardcoded string from the caller (e.g., `'v1'`), not user input. But the pattern is dangerous and could become vulnerable if refactored.

**Fix**: Use parameterized queries via `sqlite.getAllSync('SELECT ... WHERE id = ?', [id])`.

---

### 50. LIKE Wildcards Not Escaped in Exercise Search (`apps/worker/src/routes/exercises.ts:16`)

```ts
.where(like(schema.exercises.name, `%${search}%`))
```
User input `search` is passed directly into a LIKE pattern without escaping `%` or `_`. A search for `%` returns all exercises. Not a security vulnerability (Drizzle parameterizes), but causes unexpected results.

**Fix**: Escape `%`, `_`, and `\` in the search string before passing to `like()`.

---

### 51. Unvalidated `parseInt` on `days`/`limit` Query Params (`apps/worker/src/routes/whoop.ts:204`, `apps/worker/src/routes/workouts.ts:90`)

```ts
const days = parseInt(c.req.query('days') ?? '30', 10);
```

If the query value is non-numeric, `parseInt` returns `NaN`. `Date.now() - NaN * ...` becomes `NaN`, creating an invalid Date that silently produces wrong results.

**Fix**: Validate the parse result: `const days = ...; const safe = Number.isFinite(days) && days > 0 ? days : 30`.

---

### 73. Plaintext PII in D1 (`packages/db/src/schema.ts:22-30,351-365`)

The `user` table stores `name` and `email` in plaintext. The `whoopProfile` table stores `email`, `firstName`, and `lastName` in plaintext. WHOOP `rawData` columns contain full API responses with health metrics. The `ENCRYPTION_MASTER_KEY` only encrypts WHOOP tokens — not PII or health data. While D1 provides encryption at rest, data is in plaintext to anyone with D1 query access.

**Fix**: Evaluate field-level encryption for PII columns. Consider encrypting `rawData` JSON blobs at the application layer.

---

### 74. `Math.random()` Fallback for ID Generation (`packages/db/src/schema.ts:11-20`)

`generateId` falls back to `Math.random()` if `crypto.randomUUID` is unavailable. Predictable IDs enable ID enumeration attacks. While `crypto.randomUUID()` is available in all Cloudflare Workers, the fallback is a latent risk in test or non-Web-Crypto environments.

**Fix**: Remove the fallback. Always require `crypto.randomUUID()`. At minimum, replace `Math.random()` with `crypto.getRandomValues()`.

---

### 75. Web Platform Stores Auth Cookies in `localStorage` (`apps/expo/lib/platform-storage.ts:41-63`)

For the web platform, auth session tokens are stored in `window.localStorage`, making them accessible to any JavaScript on the same origin (XSS-vulnerable). The native version uses `expo-secure-store` (encrypted). Better Auth's web integration may support `httpOnly` cookies; verify and switch.

**Fix**: Use `httpOnly` cookies for web auth instead of `localStorage`. The `credentials: 'include'` fetch option in `api.ts:90` already supports cookie-based auth.

---

### 76. Pending Workouts Stored in Platform Storage — SecureStore Size Limit Risk (`apps/expo/lib/storage.ts:13-59`)

Full workout objects (exercises + sets) are stored in `SecureStore`. Android `SecureStore` has a ~2KB per-item limit. Large workouts can exceed this, causing silent storage failures.

**Fix**: Store pending workouts in the local SQLite database, or store only minimal metadata and retrieve full data from the local DB.

---

### 77. Unbounded Local SQLite Workout History Queries (`apps/expo/db/workouts.ts:360-497`)

`getLocalLastCompletedExerciseSnapshots` loads ALL user exercises, ALL completed workout exercise rows, and ALL sets — all unbounded. Years of data = thousands of rows in memory.

**Fix**: Add `LIMIT 1000` to history queries. Cap the set query similarly.

---

### 78. Chat `content` TEXT Column Has No Size Cap (`packages/db/src/schema.ts:615`)

The `nutritionChatMessages.content` column stores full AI assistant responses with no size limit. Over months, a power user can accumulate many MB of chat text. Unlike `imageBase64` (#40), the text content itself has no cap.

**Fix**: Truncate content to ~10KB during storage. The meal analysis JSON is already extracted separately.

---

### 79. Local Chat Queue Polling Runs Unconditionally (`apps/expo/app/(app)/nutrition.tsx:694-771`)

A `setInterval` polls the `localChatMessageQueue` table every 2 seconds regardless of screen focus. Restarts on AppState changes. Burns battery and local DB queries indefinitely.

**Fix**: Clear the interval when the screen loses focus (`useFocusEffect`). Cap the polling duration.

---

### 80. `cacheTemplates` Uses N+1 INSERT Pattern (`apps/expo/db/workouts.ts:1111-1163`)

Each template exercise is inserted with an individual `db.insert(...)` — 60 sequential INSERTs for 10 templates × 6 exercises.

**Fix**: Accumulate all rows and use a single `db.insert(table).values([...rows])` bulk insert.

---

## Positive Security Practices Noted

- **Password hashing**: PBKDF2-SHA256 with 600,000 iterations, 16-byte random salt, timing-safe comparison (`auth/password.ts`)
- **Token encryption**: AES-GCM with 12-byte random IV, master key length validation (`utils/crypto.ts`)
- **WHOOP webhook auth**: HMAC-SHA256 with 5-min time window + timing-safe comparison (`whoop/webhook.ts`)
- **WHOOP OAuth state**: HMAC-signed state with 10-min expiry (`lib/whoop-oauth.ts`)
- **Auth enforcement**: `createHandler`/`requireAuth` used consistently on all user-data routes; nested resources use inner-join guards (`api/auth.ts`, `api/guards.ts`)
- **Soft deletes**: Domain tables use `is_deleted` flags instead of physical deletion (`exercises`, `templates`, `workouts`, etc.)
- **SQL injection**: All Worker queries use Drizzle's parameterized query builder — no raw SQL string concatenation
- **CORS**: Strict origin allowlist in production (only app scheme, worker base URL); LAN-only in dev
- **No .env files in repo**: Secrets managed by Infisical injection at runtime
- **Chunked DB operations**: Custom batching respects D1's 100-param and 45-statement limits (`packages/db/src/utils/d1-batch.ts`)

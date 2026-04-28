# TODO Audit: Security, D1 Writes, App Size, and Performance

This is a handoff checklist from the project audit. Treat existing local changes as user-owned; do not revert unrelated edits.

Verification baseline from the audit:

- `bun run test` passed: 9 files, 67 tests.
- `bun run typecheck` passed.
- `bun run check` failed only because `apps/worker/src/api/home/summary.ts` had formatting issues and was already locally modified.

Cloudflare D1 constraints to keep in mind:

- D1 has a 100 bound-parameter limit per query.
- D1 has a 100 KB SQL statement limit.
- A Worker invocation can open up to 6 simultaneous D1 connections.
- Each D1 database executes queries sequentially; `db.batch()` reduces round trips and runs statements transactionally in order.

Sources:

- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

## 1. Security Hardening

### 1.1 Remove or protect public debug endpoint

- File: `apps/worker/src/routes/health.ts`
- Current issue: `/api/debug/auth-check` is public and returns user emails plus session metadata.
- Action:
  - Prefer deleting the endpoint.
  - If keeping it, require `APP_ENV=development` and authenticated/admin-only access.
- Acceptance:
  - The endpoint is unavailable in staging/prod.
  - No unauthenticated route returns user or session lists.

### 1.2 Tighten CORS

- File: `apps/worker/src/index.ts`
- Current issue: unknown origins fall back to `*` while `credentials: true` is enabled, and dev origin logic is not clearly limited to development.
- Action:
  - In non-development, allow only configured trusted origins and `WORKER_BASE_URL`.
  - Allow LAN, localhost, and Expo origins only when `APP_ENV=development`.
  - For disallowed origins, return no CORS origin instead of `*`.
- Acceptance:
  - Unknown production origins do not get credentialed CORS access.
  - Expo/LAN dev flows still work with `APP_ENV=development`.

### 1.3 Enforce secure production auth config

- File: `apps/worker/src/auth.ts`
- Current issue: production can fall back to insecure/lax cookie behavior if `WORKER_BASE_URL` is missing or not HTTPS.
- Action:
  - Fail fast when `APP_ENV !== 'development'` and `WORKER_BASE_URL` is missing or not HTTPS.
  - Keep production cookies `secure: true` and `sameSite: 'strict'`.
- Acceptance:
  - Misconfigured prod/staging Worker throws during auth setup instead of silently using insecure cookies.

### 1.4 Escape reflected HTML and reduce OAuth error leakage

- File: `apps/worker/src/index.ts`
- Current issues:
  - `/connect-whoop` interpolates `error` into HTML.
  - WHOOP OAuth callback redirects raw caught `Error.message` back to the app.
- Action:
  - Escape HTML text before embedding in `/connect-whoop`.
  - Map callback failures to stable error codes such as `token_exchange_failed`, `profile_fetch_failed`, or `unknown`.
- Acceptance:
  - Reflected error text cannot inject markup.
  - Sensitive upstream error messages are not sent to clients.

### 1.5 Replace broad update spreads with allowlists

- Files:
  - `apps/worker/src/routes/workouts.ts`
  - `apps/worker/src/routes/templates.ts`
  - `apps/worker/src/routes/exercises.ts`
  - `apps/worker/src/routes/program-cycles.ts`
  - Nutrition update handlers under `apps/worker/src/api/nutrition/` and `apps/worker/src/routes/nutrition-*`
- Current issue: several handlers spread request bodies into update data.
- Action:
  - Explicitly allow only fields each endpoint owns.
  - Reject or ignore protected fields: `id`, `userId`, `createdAt`, `updatedAt`, `isDeleted`, auth/session fields, and linkage fields unless the route specifically owns them.
- Acceptance:
  - Tests prove a caller cannot update ownership, deletion flags, IDs, or timestamps through generic update bodies.

### 1.6 Add real rate limiting

- Existing table: `rate_limit` in `packages/db/src/schema.ts`
- Current issue: only nutrition image chat has a simple count check; no general limiter is used.
- Action:
  - Add a shared rate-limit helper.
  - Apply it to AI chat, auth-sensitive routes, WHOOP sync, and webhook endpoints where appropriate.
  - Add required indexes before rollout.
- Acceptance:
  - Abuse-prone endpoints return `429` with stable error bodies after limits.
  - Normal app flows stay unaffected.

## 2. D1 Write Throughput and Query Efficiency

### 2.1 Generate/apply missing index migration

- File: `packages/db/src/schema.ts`
- Current issue: many indexes are declared in TypeScript, but existing migrations mostly contain unique indexes and three auth indexes.
- Action:
  - Generate a migration for declared indexes not present in `packages/db/drizzle/migrations/*.sql`.
  - Include indexes for workouts, workout exercises, workout sets, templates, exercises, program cycles, WHOOP tables, nutrition entries, chat history, and rate limits.
- Acceptance:
  - Migration contains only missing indexes/constraints.
  - `bun run db:generate` produces no unexpected drift afterward.

### 2.2 Add unique constraints needed for safe upserts

- Candidate constraints:
  - `exercises(user_id, library_id)` for persisted library exercises.
  - `user_integration(user_id, provider)`.
  - `user_integration(provider, provider_user_id)`, if provider user IDs are stable and non-null in practice.
  - `nutrition_training_context(user_id, created_at)` may not be enough for daily upsert; consider a local-date column only if product behavior requires one.
- Acceptance:
  - Upsert paths have matching DB uniqueness guarantees.
  - Existing duplicate data is handled before unique constraints are applied.

### 2.3 Tune D1 helper concurrency

- File: `packages/db/src/utils/d1-batch.ts`
- Current issue: `DEFAULT_CONCURRENCY = 8`, but D1 allows up to 6 simultaneous connections per Worker invocation.
- Action:
  - Reduce default concurrency to `4` or at most `6`.
  - Keep `DEFAULT_MAX_QUERY_PARAMS = 100`.
  - Keep chunk sizing based on actual defined insert columns.
- Acceptance:
  - Batch helper tests cover chunk size and concurrency.
  - No helper schedules more than the configured concurrency.

### 2.4 Collapse serial workout-from-template writes

- File: `apps/worker/src/routes/workouts.ts`
- Current issue: `POST /api/workouts` inserts workout exercises and sets inside a serial loop, with per-exercise history lookups.
- Action:
  - Pre-generate workout exercise IDs.
  - Bulk insert all workout exercises with `chunkedInsert`.
  - Bulk insert all sets in one `chunkedInsert`.
  - Replace per-exercise history lookups with a grouped/batched query where practical.
- Acceptance:
  - Same response and persisted workout shape as before.
  - Fewer D1 round trips for templates with multiple exercises.

### 2.5 Batch program-generated workout writes

- File: `apps/worker/src/lib/program-helpers.ts`
- Current issue: program workout start already batches some inserts, but still resolves exercises serially and does cleanup manually on failure.
- Action:
  - Keep pre-generated IDs.
  - Batch workout, workout exercises, sets, and program-cycle linkage where possible.
  - Use transactional `db.batch()` for multi-step creates.
  - Avoid manual cleanup as the primary rollback strategy.
- Acceptance:
  - Program workout start remains idempotent.
  - Partial rows are not left behind if any insert fails.

### 2.6 Batch one-rep-max test workout creation

- File: `apps/worker/src/lib/program-helpers.ts`
- Current issue: `createOneRMTestWorkout` loops through four lifts and serially creates exercises, workout exercises, and sets.
- Action:
  - Resolve/create main lift exercises with a bounded batch strategy.
  - Pre-generate workout exercise IDs.
  - Batch insert workout exercises and sets.
- Acceptance:
  - Created 1RM workout shape is unchanged.
  - D1 calls are reduced.

### 2.7 Replace select-then-insert/update with upserts

- Candidate files:
  - `apps/worker/src/routes/profile.ts`
  - `apps/worker/src/api/nutrition/body-stats.ts`
  - `apps/worker/src/api/nutrition/training-context.ts`
  - `apps/worker/src/whoop/token-rotation.ts`
  - `apps/worker/src/whoop/sync.ts`
  - `packages/db/src/program/exercise.ts`
  - `apps/worker/src/lib/program-helpers.ts`
- Action:
  - Use Drizzle/SQLite `onConflictDoUpdate` where matching unique constraints exist.
  - Keep response shapes the same.
- Acceptance:
  - Upsert tests cover create and update branches.
  - No extra read is required solely to decide insert vs update.

### 2.8 Optimize repeated read paths

- File: `apps/worker/src/api/home/summary.ts`
- Current issue: weekly streak calculation performs a loop with one query per day.
- Action:
  - Replace with one bounded query over recent completed workouts.
  - Compute streak in memory from returned dates.
- Acceptance:
  - Same streak output for consecutive, skipped, and no-workout cases.
  - One query replaces the loop.

## 3. App File Size and Runtime Performance

### 3.1 Reduce icon font payload

- Current build observation:
  - `apps/expo/dist` is about `7.5M`.
  - Largest JS entry is about `3.58M` raw / `868K` gzip.
  - Vector icon fonts contribute roughly `3.9M` raw.
- Files:
  - All Expo files importing `@expo/vector-icons`, especially `Ionicons`.
- Action:
  - Replace broad imports with direct icon-set imports where possible, such as package paths that only load Ionicons.
  - Rebuild and confirm only required font assets ship.
- Acceptance:
  - Fewer font files in `apps/expo/dist/assets`.
  - Web build size decreases measurably.

### 3.2 Align dependency versions across root and Expo package

- Files:
  - `package.json`
  - `apps/expo/package.json`
- Current issue: root and Expo package disagree on React, React Native, Better Auth, React Query, Reanimated, and Worklets versions.
- Action:
  - Choose the Expo SDK 55-compatible versions.
  - Align workspace package manifests.
  - Run `bun install`.
- Acceptance:
  - No duplicate/conflicting major runtime dependencies.
  - Typecheck and tests pass.

### 3.3 Split client-safe shared code from DB/server exports

- File: `packages/db/src/index.ts`
- Current issue: Expo imports from `@strength/db`, whose barrel exports schema, Drizzle helpers, program DB helpers, exercise library, timezones, and utility code.
- Action:
  - Add a client-safe export surface for Expo, for example `@strength/db/client`.
  - Include only IDs, units, exercise library, timezone helpers, and client-safe types.
  - Move Expo imports to the client-safe entrypoint.
- Acceptance:
  - Expo bundle does not need schema/Drizzle/server helper exports.
  - Existing app behavior is unchanged.

### 3.4 Move app-only providers out of root layout

- Files:
  - `apps/expo/app/_layout.tsx`
  - `apps/expo/app/(app)/_layout.tsx`
- Current issue: auth routes load app-only providers.
- Action:
  - Keep `QueryProvider` at root.
  - Move `UserPreferencesProvider` and `WorkoutSessionProvider` into `(app)/_layout.tsx`.
- Acceptance:
  - Auth and callback screens still work.
  - App tabs still have preferences and workout session context.

### 3.5 Lazy-load heavy modals/data

- Files:
  - `apps/expo/app/(app)/_layout.tsx`
  - `apps/expo/components/profile/TimezonePickerModal.tsx`
  - `packages/db/src/timezones.ts`
- Current issue: timezone modal/list can be loaded globally.
- Action:
  - Render/import timezone and weight modals only when needed.
  - Avoid loading the full timezone list until the timezone modal is visible.
- Acceptance:
  - Initial app shell loads less code/data.
  - Timezone selection still works.

### 3.6 Tune React Query defaults

- File: `apps/expo/providers/QueryProvider.tsx`
- Current issue: `refetchOnWindowFocus` is enabled globally.
- Action:
  - Set global `refetchOnWindowFocus: false`.
  - Keep manual pull-to-refresh.
  - Use route-specific refetch only where freshness matters.
- Acceptance:
  - Navigating/focusing the app does not trigger unnecessary network bursts.
  - Screens with freshness needs still refresh intentionally.

### 3.7 Optimize large screens and lists

- Candidate files:
  - `apps/expo/app/(app)/programs.tsx`
  - `apps/expo/app/(app)/nutrition.tsx`
  - `apps/expo/app/(app)/workouts.tsx`
  - `apps/expo/components/template/TemplateEditor/index.tsx`
  - `apps/expo/components/workout/ExerciseSearch.tsx`
- Actions:
  - Split very large route files into focused components.
  - Memoize row components where useful.
  - Use `FlatList` for long lists.
  - In `ExerciseSearch`, convert `excludeIds` to a memoized `Set` and avoid repeated `some()` scans over user exercises for every library item.
- Acceptance:
  - No visual regressions.
  - Search and long-list interactions remain smooth.

## 4. Suggested Work Order

1. Security quick fixes:
   - Remove/protect debug endpoint.
   - Tighten CORS.
   - Escape WHOOP HTML and hide raw OAuth errors.
   - Add update allowlists.

2. DB correctness foundation:
   - Generate/apply missing indexes.
   - Add unique constraints required for upserts.

3. D1 write improvements:
   - Tune batch helper concurrency.
   - Batch workout/template/program write paths.
   - Replace select-then-write flows with upserts.

4. App size/performance:
   - Align dependency versions.
   - Reduce icon font payload.
   - Add client-safe shared exports.
   - Move/lazy-load app-only providers and heavy modals.
   - Tune React Query and list rendering.

## 5. Final Verification Commands

Run these before considering the audit work complete:

```bash
bun run check
bun run test
bun run typecheck
bun run web:build
du -sh apps/expo/dist
find apps/expo/dist -type f -printf '%s %p\n' | sort -nr | head -40
```

Expected final state:

- All checks pass.
- No public debug data exposure.
- D1 migrations match schema.
- High-write endpoints use fewer D1 round trips.
- Expo web build ships fewer unnecessary assets and has smaller JS/font payload.

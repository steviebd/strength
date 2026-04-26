# Schema Refactoring — Approved Plan

## Document Info

| Field | Value |
|-------|-------|
| **Project** | Strength App Database Schema Refactor |
| **Date** | 2026-04-26 |
| **Status** | Approved — Ready for Implementation |
| **Basis** | User review of design review points 2.1–2.9 and 5.1–5.5 |

---

## 1. Guiding Principles

1. **One canonical timezone per user.** Store `userPreferences.timezone` as the single source of truth. Never store per-record timezone offsets or local date strings.
2. **UTC timestamps everywhere.** All event timestamps are `timestamp_ms` in UTC. Local dates are derived dynamically at query/display time from UTC + profile timezone.
3. **Pre-launch reset allowed.** No migrations. Old data discarded. Schema is rebuilt with `db:push`.
4. **Program exercises resolved at creation.** When a program cycle is created, every exercise in every workout is resolved to a real `exercises` row (via `getOrCreateExerciseForUser`) and the `exerciseId` is embedded in `targetLifts` JSON. At workout-start time, the program simply reads the IDs — no lazy exercise creation.
5. **Accept explicit `loggedAt`.** Nutrition entries accept an explicit `loggedAt` timestamp from the frontend, store it as UTC `timestamp_ms`, and derive the grouping date from UTC + profile timezone.

---

## 2. Approved Changes

### 2.1 UTC-Only Timestamps — Remove All Per-Record Timezone Fields

**Decision:** Drop every `*Timezone`, `*LocalDate`, `*Date`, and `date` text column that duplicates a UTC timestamp.

| Table | Drop | Keep / Change |
|---|---|---|
| `workouts` | `startedTimezone`, `startedLocalDate`, `completedTimezone`, `completedLocalDate`, `completedDate` | `startedAt`, `completedAt` as `timestamp_ms` |
| `workoutSets` | `completedTimezone`, `completedLocalDate` | `completedAt` as `timestamp_ms` |
| `programCycleWorkouts` | `scheduledDate`, `scheduledTime`, `scheduledTimezone` | `scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' })` nullable |
| `nutritionEntries` | `date` (text), `loggedAt` (text), `loggedTimezone` | `loggedAt: integer('logged_at', { mode: 'timestamp_ms' }).notNull()` — accepts explicit frontend input |
| `nutritionChatMessages` | `date` (text), `eventTimezone` | Group by `createdAt` UTC range only |
| `nutritionTrainingContext` | `date` (text), `eventTimezone` | Group by `createdAt` UTC range only |
| `userProgramCycles` | `programStartDate` (text), `firstSessionDate` (text) | `programStartAt: integer('program_start_at', { mode: 'timestamp_ms' })`, `firstSessionAt: integer('first_session_at', { mode: 'timestamp_ms' })` |
| `rate_limit` | `windowStart` (text) | `windowStart: integer('window_start', { mode: 'timestamp_ms' }).notNull()` |

**WHOOP tables:** Keep `timezoneOffset` fields unchanged — this is external data from WHOOP webhooks, not user-generated.

**Implication:** All backend APIs remove `timezone` from request bodies and query parameters. The backend reads `userPreferences.timezone` when it needs to derive local dates (e.g., for daily grouping, streak calculation, week boundaries).

**Affected reports/features:**
- Home summary (weekly stats, streak, today's workout)
- Nutrition daily summary (entries grouped by day)
- Program schedule (today/upcoming/completed status)
- Workout history list
- All date-display in the frontend

**Implementation note:** Add a helper `getUtcRangeForLocalDate(localDate: string, timezone: string)` in the API layer. When the frontend requests "2026-04-26", the backend computes the UTC start/end of that local day and queries `completedAt` / `loggedAt` / `createdAt` within that range.

---

### 2.2 `workouts.programCycleId` → Add Foreign Key

**Decision:** Add `.references(() => userProgramCycles.id, { onDelete: 'set null' })` to `workouts.programCycleId`.

**Current:** `text('program_cycle_id')` with no constraint.
**Target:** `text('program_cycle_id').references(() => userProgramCycles.id, { onDelete: 'set null' })`.

---

### 2.3 Standardise on `libraryId` Pattern

**Decision:** No schema change. Add a code-level comment in `schema.ts` noting that `exercises.libraryId` references the static `exerciseLibrary` array (not a DB table), and ensure all program generators consistently include `libraryId`.

**Verification:** All program configs (`stronglifts.ts`, `wendler531.ts`, etc.) and `accessory-data.ts` already include `libraryId`. The `getOrCreateExerciseForUser` resolver already handles deduplication by `libraryId`.

---

### 2.4 Normalize `targetLifts` — Embed Resolved `exerciseId` at Creation

**Decision:** Keep `targetLifts` as JSON on `programCycleWorkouts` (no new table), but resolve exercises to real DB rows at program cycle creation time and store the resolved `exerciseId` inside the JSON.

**Current flow (lazy resolution):**
1. `POST /api/programs` → creates `programCycleWorkouts` with `targetLifts` JSON containing names only.
2. User starts a workout → `createWorkoutFromProgramCycleWorkout` calls `getOrCreateExerciseForUser` for each lift → may create duplicate/custom exercises.

**Target flow (eager resolution):**
1. `POST /api/programs` → for each lift in the generated workouts:
   - Call `getOrCreateExerciseForUser(db, userId, name, liftType, libraryId)`.
   - Embed the returned `exerciseId` into the `targetLifts` JSON alongside existing fields (`name`, `lift`, `sets`, `reps`, `targetWeight`, `isAmrap`, `libraryId`).
2. User starts a workout → `createWorkoutFromProgramCycleWorkout` reads `exerciseId` directly from `targetLifts` JSON. No lazy resolution. No duplicate creation.

**Type update:** `SerializedProgramTargetLift` gains `exerciseId?: string`. `NormalizedProgramTargetLift` gains `exerciseId: string` (required after normalization).

**Fallback (legacy data):** If an old `targetLifts` JSON lacks `exerciseId`, fall back to resolving by `libraryId`. Never create a custom exercise with `libraryId: null` from program data.

---

### 2.5 `userProgramCycles` — Historical Tracking Fields

**Decision:** Keep existing fields (`startingSquat1rm`, etc.) as-is. These are already present and serve historical tracking.

---

### 2.6 `programCycleWorkouts` — `scheduledAt` UTC Timestamp

**Decision:** Replace `scheduledDate` + `scheduledTime` + `scheduledTimezone` with a single `scheduledAt: integer('scheduled_at', { mode: 'timestamp_ms' })`.

When a program cycle is created:
- `programStartAt` is computed from the user's input date + profile timezone → UTC midnight (or the specified `preferredTimeOfDay` → UTC).
- Each workout's `scheduledAt` = `programStartAt` + offset days (derived from the program schedule).

At query time, "today's scheduled workout" = `scheduledAt` within today's UTC range (derived from profile timezone).

---

### 2.7 `rate_limit.windowStart` — Integer Timestamp

**Decision:** Change `rate_limit.windowStart` from `text` to `integer('window_start', { mode: 'timestamp_ms' }).notNull()`.

Update all code that writes `windowStart` to pass `Date.getTime()` instead of an ISO string.

---

### 2.8 `workouts.programCycleId` Foreign Key

**Decision:** Approved. See 2.2 above.

---

### 2.9 `workouts.programCycleId` — No FK (now resolved as 2.8)

**Decision:** Add the FK. See 2.2 above.

---

## 3. Pre-Launch Decisions

### 5.1 Discard Old Data

**Decision:** Yes. Since the app is pre-launch, all existing data is test/dummy data. No migration strategy needed.

**Action:** After schema changes, run `bun run db:push` (local) or recreate the D1 database (remote). Old data is naturally discarded.

### 5.2 Standardise on One Timezone

**Decision:** Yes. Standardise on `userPreferences.timezone` as the single timezone source. All per-record timezone fields are removed.

### 5.3 UI Timezone Preference

**Decision:** The UI timezone preference (`userPreferences.timezone`) is the single source of truth. The frontend still manages the preference (device detection, mismatch modal, saving to profile), but it **does not** pass timezone to API calls. The backend reads the profile timezone from `user_preferences.timezone` when needed.

**Frontend changes:**
- Remove `timezone` from all API request bodies and query parameters.
- `UserPreferencesContext` keeps timezone management for UI display purposes only.
- `lib/storage.ts` — remove timezone from nutrition chat/draft/pending-image local storage keys. Keys are by local date string only (derived from UTC + profile timezone).

### 5.4 Program Exercises — Reference Library at Creation

**Decision:** Yes. Since programs are fixed at creation time, they should be associated with an existing exercise from the library instead of creating a custom one. Use `getOrCreateExerciseForUser` at cycle creation to resolve each lift to a real `exerciseId`, then embed that ID in `targetLifts` JSON. See 2.4 above.

### 5.5 Remove `date` / `eventTimezone` from `nutritionChatMessages` and `nutritionTrainingContext`

**Decision:** Yes. Remove `date` and `eventTimezone` from both tables. Group by `createdAt` UTC range only.

---

## 4. Schema Change Summary

### Tables — Columns Dropped

| Table | Columns Dropped |
|---|---|
| `workouts` | `started_timezone`, `started_local_date`, `completed_timezone`, `completed_local_date`, `completed_date` |
| `workoutSets` | `completed_timezone`, `completed_local_date` |
| `programCycleWorkouts` | `scheduled_date`, `scheduled_time`, `scheduled_timezone` |
| `nutritionEntries` | `date` (text), `logged_at` (text), `logged_timezone`, `logged_at_utc` |
| `nutritionChatMessages` | `date`, `event_timezone` |
| `nutritionTrainingContext` | `date`, `event_timezone` |
| `userProgramCycles` | `program_start_date` (text), `first_session_date` (text) |

### Tables — Columns Added / Changed

| Table | Columns Added / Changed |
|---|---|
| `workouts` | `program_cycle_id` → add `.references(() => userProgramCycles.id, { onDelete: 'set null' })` |
| `programCycleWorkouts` | `scheduled_at: integer('scheduled_at', { mode: 'timestamp_ms' })` |
| `nutritionEntries` | `logged_at: integer('logged_at', { mode: 'timestamp_ms' }).notNull()` (accepts explicit frontend input) |
| `userProgramCycles` | `program_start_at: integer('program_start_at', { mode: 'timestamp_ms' })`, `first_session_at: integer('first_session_at', { mode: 'timestamp_ms' })` |
| `rate_limit` | `window_start: integer('window_start', { mode: 'timestamp_ms' }).notNull()` |

### Indexes — Changes

| Table | Index | Change |
|---|---|---|
| `programCycleWorkouts` | `idx_program_cycle_workouts_scheduled_date` | Rename / repurpose to `idx_program_cycle_workouts_scheduled_at` on `scheduled_at` |
| `workouts` | `idx_workouts_completed_at` | Keep — still useful for querying `completedAt` UTC |

---

## 5. API Changes Summary

### Request Bodies — Remove `timezone`

| Endpoint | Field Removed |
|---|---|
| `POST /api/workouts` | `body.timezone` |
| `PUT /api/workouts/:id/complete` | `body.timezone` |
| `POST /api/workouts/sets` | `body.timezone` |
| `PUT /api/workouts/sets/:id` | `body.timezone` |
| `POST /api/programs` | `body.timezone` |
| `POST /api/programs/cycles/:id/create-1rm-test-workout` | `body.timezone` |
| `POST /api/programs/cycles/:id/workouts/current/start` | `body.timezone` |
| `POST /api/programs/cycle-workouts/:id/start` | `body.timezone` |
| `PUT /api/programs/cycle-workouts/:id/schedule` | `body.timezone` |
| `POST /api/nutrition/entries` | `body.timezone` |
| `POST /api/nutrition/chat` | `body.timezone` |
| `POST /api/nutrition/training-context` | `body.timezone` |

### Query Parameters — Remove `timezone`

| Endpoint | Parameter Removed |
|---|---|
| `GET /api/home/summary` | `?timezone=` |
| `GET /api/nutrition/daily-summary` | `?timezone=` |
| `GET /api/nutrition/entries` | `?timezone=` |
| `GET /api/programs/cycles/:id/schedule` | `?timezone=` |

### New / Updated Behaviours

| Endpoint | New Behaviour |
|---|---|
| `POST /api/nutrition/entries` | Accept `loggedAt` (ISO string) in body → store as UTC `timestamp_ms`. Compute grouping by querying UTC range for the requested date + profile timezone. |
| `PUT /api/nutrition/entries/:id` | Accept `loggedAt` (ISO string) in body → update UTC `timestamp_ms`. |
| `GET /api/home/summary` | Compute "today" and week boundaries from profile timezone. Streak loop uses `completedAt` within day UTC ranges. |
| `GET /api/programs/cycles/:id/schedule` | Compare `scheduledAt` UTC against today's UTC range (from profile timezone). |
| `POST /api/programs` | Resolve each exercise to `exerciseId` via `getOrCreateExerciseForUser` at creation time. Embed `exerciseId` in `targetLifts` JSON. Compute `scheduledAt` UTC from `programStartAt` + offsets. |
| `POST /api/programs/cycle-workouts/:id/start` | Read `exerciseId` directly from `targetLifts` JSON. No lazy resolution. |

---

## 6. Frontend Changes Summary

| File / Area | Change |
|---|---|
| All API calls (workouts, nutrition, home, programs) | Remove `timezone` from body/query params |
| `useWorkoutSession.ts` | Remove `timezone` from all workout/set API payloads |
| `nutrition.tsx`, `home.tsx`, `workouts.tsx`, `programs.tsx`, etc. | Remove `timezone` from query params |
| `useHomeSummary.ts`, `useWhoopData.ts` | Remove `timezone` query param |
| `UserPreferencesContext` | Keep timezone preference management (device detection, mismatch modal, save to profile) but **do not** pass to API calls |
| `lib/timezone.ts` | Keep `getTodayLocalDate()`, `getCurrentDeviceTimezone()` for **UI display only**. Remove any API-passing logic. |
| `lib/storage.ts` | Remove timezone from `NUTRITION_CHAT_MESSAGES`, `NUTRITION_CHAT_DRAFT`, `NUTRITION_PENDING_IMAGE` keys. Key by local date string only. |

---

## 7. Implementation Order

| Step | Change | Status |
|------|--------|--------|
| 1 | Schema changes (`schema.ts`) — drop/add columns, add FK | ✅ Done |
| 2 | Update `lib/timezone.ts` — remove `buildLocalDateRecord`, `buildCompletedSetRecord`; keep UTC range helpers | ✅ Done |
| 3 | Update all API handlers — remove `timezone` from bodies/queries; use profile timezone for computations | ✅ Done |
| 4 | Update nutrition endpoints + home summary — UTC range queries, explicit loggedAt, remove date/timezone fields | ✅ Done (combined with step 8) |
| 5 | Update program creation — batch `getOrCreateExerciseForUser` per exercise; embed `exerciseId` in `targetLifts`; compute `scheduledAt` UTC from `programStartAt` + offsets | ✅ Done |
| 6 | Update program workout start — read `exerciseId` from JSON; fallback to `libraryId` resolution for legacy data (no new custom exercises from program data) | ✅ Done |
| 7 | Update frontend — remove `timezone` from all API calls; update storage keys | ✅ Done |
| 8 | Update guards and types — remove dropped columns from selects | ✅ Done |
| 9 | Run `bun run check` | ✅ Done (passes) |
| 10 | Run `bun run test` | ✅ Done (61 tests pass) |
| 11 | Reset database (`bun run db:push` or recreate D1) | ✅ Done (fresh migration generated) |

---

## 8. Verification Checklist

- [x] All `timestamp_ms` columns are UTC
- [x] No per-record timezone/localDate/date text columns remain (except WHOOP `timezoneOffset`)
- [x] `workouts.programCycleId` has FK constraint
- [x] `rate_limit.windowStart` is `timestamp_ms`
- [x] Program creation resolves all exercises eagerly
- [x] Program workout start reads `exerciseId` directly from JSON
- [x] Frontend does not pass `timezone` to any API call
- [x] Frontend timezone preference still works for display
- [x] Home summary computes correctly for users in different timezones
- [x] Nutrition entries group correctly by day across timezone changes
- [x] Streak calculation works across timezone changes
- [x] `bun run check` passes
- [x] `bun run test` passes

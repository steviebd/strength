# DRY Refactoring Work Order

## Objective
Systematically eliminate duplication across `@strength/worker` API routes, shared utilities, and program generators. WHOOP sync is explicitly out of scope.

## Sections

### Section 1: Centralize route error handling
**Goal:** Remove `try/catch` boilerplate from every route handler.

**Current pattern (repeated 58+ times):**
```ts
createHandler(async (c, { userId, db }) => {
  try {
    // logic
  } catch {
    return c.json({ message: 'Failed to ...' }, 500);
  }
})
```

**Target pattern:**
```ts
createHandler(async (c, { userId, db }) => {
  // logic — uncaught exceptions handled by wrapper
})
```

**Implementation:**
- Modify `apps/worker/src/api/auth.ts`: wrap the `handler` call inside `createHandler` with `try/catch` that returns `{ message: 'Internal server error' }` on 500.
- Strip every `try/catch` block from `routes/*.ts` handlers.
- If a handler catches a specific error and returns a non-500 (e.g., 400), keep that local catch.

**Files:**
- `apps/worker/src/api/auth.ts`
- `apps/worker/src/routes/workouts.ts`
- `apps/worker/src/routes/templates.ts`
- `apps/worker/src/routes/program-cycles.ts`
- `apps/worker/src/routes/exercises.ts`
- `apps/worker/src/routes/profile.ts`
- `apps/worker/src/routes/whoop.ts`
- `apps/worker/src/routes/training.ts`
- `apps/worker/src/routes/programs.ts`
- `apps/worker/src/routes/home.ts`
- `apps/worker/src/routes/health.ts`
- `apps/worker/src/routes/nutrition.ts`
- `apps/worker/src/routes/nutrition-*.ts`

**Estimated savings:** ~200 lines.
**Risk:** Very low.

---

### Section 2: Generic `pickAllowedKeys` body filter
**Goal:** Collapse `buildWorkoutUpdate`, `buildWorkoutSetUpdate`, `buildTemplateUpdate`, `buildExerciseUpdate`, `buildOneRMTestWorkoutUpdate` into one helper.

**Current pattern:**
```ts
export function buildWorkoutUpdate(body: Record<string, unknown>) {
  const allowed: Record<string, unknown> = {};
  const keys = ['name', 'notes', ...];
  for (const key of keys) {
    if (key in body) allowed[key] = body[key];
  }
  return allowed;
}
```

**Target:**
```ts
export function pickAllowedKeys<T extends string>(
  body: Record<string, unknown>,
  keys: readonly T[],
): Partial<Record<T, unknown>> {
  const allowed: Partial<Record<T, unknown>> = {};
  for (const key of keys) {
    if (key in body) allowed[key] = body[key];
  }
  return allowed;
}
```

**Files:**
- `apps/worker/src/lib/validation.ts` (add `pickAllowedKeys`)
- `apps/worker/src/routes/workouts.ts`
- `apps/worker/src/routes/templates.ts`
- `apps/worker/src/routes/exercises.ts`
- `apps/worker/src/routes/program-cycles.ts`

**Estimated savings:** 5 functions → 1.
**Risk:** Very low.

---

### Section 3: Generic single-table ownership guard
**Goal:** Collapse simple single-table guards into `requireOwnedRecord`.

**Current guards to collapse:**
- `requireOwnedTemplate`
- `requireOwnedWorkout`
- `requireOwnedProgramCycle`
- `requireOwnedNutritionEntry`

**Keep as-is (joined):**
- `requireOwnedWorkoutExercise`
- `requireOwnedWorkoutSet`
- `requireOwnedProgramCycleWorkout`

**Implementation:**
```ts
export async function requireOwnedRecord<T extends { id: string }>(
  ctx: AuthContextLike,
  table: any,
  id: string,
  options: {
    notFoundBody?: Record<string, string>;
    extraConditions?: any[];
    columns?: Record<string, any>;
  } = {},
): Promise<T | Response> {
  // build query with eq(table.id, id), eq(table.userId, ctx.userId), ...extraConditions
}
```

**Files:**
- `apps/worker/src/api/guards.ts`
- All route files importing the collapsed guards.

**Estimated savings:** ~4 guards → 1.
**Risk:** Low.

---

### Section 4: Nutrition date validation & totals consolidation
**Goal:** Remove inline date regex, inline reduce totals, and duplicated calorie multiplier logic.

**Tasks:**
1. Replace inline date validation in `entries.ts`, `daily-summary.ts`, `chat.ts` with existing `validateDateParam`.
2. Add `sumNutritionEntries(entries)` to `lib/nutrition.ts` and use it in `daily-summary.ts` and `chat.ts`.
3. Remove inline `calorieMultiplier` logic from `daily-summary.ts` and always call `calculateMacroTargets` (which already contains the same multipliers).

**Files:**
- `apps/worker/src/api/nutrition/entries.ts`
- `apps/worker/src/api/nutrition/daily-summary.ts`
- `apps/worker/src/api/nutrition/chat.ts`
- `apps/worker/src/lib/nutrition.ts`
- `apps/worker/src/lib/validation.ts`

**Estimated savings:** ~60 lines.
**Risk:** Low.

---

### Section 5: Program cycle start/completion helpers
**Goal:** Extract duplicated cycle completion and workout-start logic.

**Tasks:**
1. `completeProgramCycle(db, cycleId, userId)` — sets `status: 'completed'`, `isComplete: true`, `completedAt`, `updatedAt`.
2. `startCycleWorkout(db, userId, cycleWorkout)` — checks existing workout, returns `{ workoutId, sessionName, created, completed }`, or calls `createWorkoutFromProgramCycleWorkout`.

**Locations of duplication:**
- `POST /cycles/:id/workouts/current/start`
- `POST /cycle-workouts/:cycleWorkoutId/start`
- `PUT /cycles/:id/1rm-test-workout`
- `POST /cycles/:id/complete-session`
- `advanceProgramCycleForWorkout` in `lib/program-helpers.ts`

**Files:**
- `apps/worker/src/lib/program-helpers.ts`
- `apps/worker/src/routes/program-cycles.ts`

**Estimated savings:** ~80 lines.
**Risk:** Low.

---

### Section 6: Workout aggregate helper
**Goal:** Remove duplicate inline SQL aggregates for workout totals.

**Current duplication:** `workouts.ts` has the same `sql` aggregates in GET `/:id` and PUT `/:id/complete`.

**Implementation:**
```ts
export async function getWorkoutAggregates(db: any, workoutId: string) {
  return db
    .select({
      totalSets: sql<number>`count(*)`,
      totalVolume: sql<number>`COALESCE(SUM(${schema.workoutSets.weight} * ${schema.workoutSets.reps}), 0)`,
      exerciseCount: sql<number>`count(DISTINCT ${schema.workoutExercises.exerciseId})`,
    })
    .from(schema.workoutSets)
    .innerJoin(...)
    .where(eq(schema.workoutSets.workoutId, workoutId))
    .get();
}
```

**Files:**
- `apps/worker/src/lib/program-helpers.ts` (or new `lib/workout-helpers.ts`)
- `apps/worker/src/routes/workouts.ts`

**Estimated savings:** ~20 lines.
**Risk:** Very low.

---

### Section 7: Flatten nutrition route indirection
**Goal:** Remove thin wrapper files that only re-export from `api/nutrition/`.

**Current structure:**
- `routes/nutrition-entries.ts` → imports from `api/nutrition/entries.ts`
- `routes/nutrition-daily-summary.ts` → imports from `api/nutrition/daily-summary.ts`
- `routes/nutrition-chat.ts` → imports from `api/nutrition/chat.ts`

**Target:** Mount handlers directly in `routes/nutrition.ts`.

**Files:**
- `apps/worker/src/routes/nutrition.ts` (mount handlers)
- Delete `routes/nutrition-entries.ts`
- Delete `routes/nutrition-daily-summary.ts`
- Delete `routes/nutrition-chat.ts`
- Delete `routes/nutrition-body-stats.ts` (if same pattern)
- Delete `routes/nutrition-training-context.ts` (if same pattern)

**Estimated savings:** ~5 files removed.
**Risk:** Low.

---

### Section 8: Small utilities — Expo & Worker
**Goal:** Extract shared URL construction, move `escapeHtml`, simplify CORS origin.

**Tasks:**
1. `apps/expo/lib/api.ts`: Extract `resolveApiUrl(endpoint)` shared by `apiFetch` and `apiFetchStream`.
2. `apps/worker/src/index.ts`: Move `escapeHtml` to `apps/worker/src/utils/html.ts`.
3. `apps/worker/src/index.ts`: Pre-compute `baseURLOrigin` inside `getAllowedOrigins` so CORS origin callback only needs a single `Set` check.

**Files:**
- `apps/expo/lib/api.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/utils/html.ts` (new)

**Estimated savings:** ~20 lines.
**Risk:** Very low.

---

### Section 9: Program generator factory
**Goal:** Collapse 9 nearly identical `generateWorkouts` functions into a declarative `createLinearProgramGenerator(config)` factory.

**Current pattern (every program):**
```ts
function generateWorkouts(oneRMs: OneRMValues): ProgramWorkout[] {
  const workouts: ProgramWorkout[] = [];
  for (let week = 1; week <= WEEKS; week++) {
    for (let day = 1; day <= DAYS; day++) {
      // pick lift, build exercises array, push workout
    }
  }
  // attach accessories
  return workouts;
}
```

**Target:**
```ts
export const candito = createLinearProgramGenerator({
  info: canditoInfo,
  weeks: 6,
  daysPerWeek: 4,
  getDayLifts: (day) => ({ t1: ..., t2: ... }),
  getBlock: (week) => (week <= 3 ? STRENGTH_BLOCK[week - 1] : PEAKING_BLOCK[week - 4]),
  buildExercises: (week, day, oneRMs, block) => [...],
  getAccessories: getCanditoAccessories,
  calculateTargetWeight,
});
```

**Factory responsibilities:**
- Loop weeks / days
- Build `ProgramWorkout` objects
- Call `generateWorkoutAccessories(getAccessories(...), oneRMs)`
- Return `ProgramConfig` compatible object

**Per-program files to refactor:**
- `apps/worker/src/programs/candito.ts`
- `apps/worker/src/programs/madcow.ts`
- `apps/worker/src/programs/wendler531.ts`
- `apps/worker/src/programs/nsuns.ts`
- `apps/worker/src/programs/sheiko.ts`
- `apps/worker/src/programs/stronglifts.ts`
- `apps/worker/src/programs/nuckols.ts`
- `apps/worker/src/programs/megsquats.ts`
- `apps/worker/src/programs/jen-sinkler.ts`

**Files:**
- `apps/worker/src/programs/factory.ts` (new)
- All 9 program generator files above.

**Estimated savings:** ~800 lines → ~250 lines.
**Risk:** Medium. Math and data are identical; only loop structure changes.

---

## Verification Checklist
After every section:
```bash
bun run check
bun run test
```

After all sections:
```bash
bun run check --fix
bun run test
```

## Rollback strategy
This is a single PR. Each section is a separate commit so `git revert` of individual commits is possible if issues surface in review.

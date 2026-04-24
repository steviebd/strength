# Test Strategy & Implementation Plan

## Overview

This project uses:
- **Vitest** for unit/integration tests (already installed)
- **Maestro** + **EAS Workflows** for E2E mobile testing

---

## Part 1: Unit Tests (Vitest)

### Current State

Vitest is already configured via Vite+ (`vp test run`). Test files exist at:
- `packages/db/src/utils/d1-batch.test.ts`
- `packages/db/src/utils/units.test.ts`
- `apps/worker/src/auth/password.test.ts`
- `apps/worker/src/api/auth.test.ts`
- `apps/worker/src/api/guards.test.ts`
- `apps/worker/src/whoop/webhook.test.ts`
- `apps/worker/src/utils/crypto.test.ts`

**Coverage target: 80%+ on `apps/worker/src/`**

### Vitest Configuration

Add coverage to `vite.config.ts`:

```typescript
test: {
  include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.spec.ts'],
  environment: 'node',
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    thresholds: {
      lines: 80,
      functions: 80,
    },
  },
},
```

Run coverage: `bun run test -- --coverage`

---

### Test File Priority List

#### High Priority

**`apps/worker/src/programs/scheduler.test.ts`** (new)
- `getDayIndex`
- `isSameDate`
- `addDays`
- `getMonday`
- `isGymDay`
- `generateWorkoutSchedule` — multiple preferredDays, scheduling across weeks
- `getCurrentWeekNumber` — today before/after/in schedule
- `getWorkoutsForWeek`
- `getWeekDateRange`
- `formatTime`
- `formatDateShort`
- `formatDateLong`

**`apps/worker/src/api/guards.test.ts`** (expand existing)
- `requireOwnedWorkout` — found + not found (different user)
- `requireOwnedWorkoutExercise` — found + not found
- `requireOwnedNutritionEntry` — found + not found + soft-deleted
- `requireOwnedProgramCycle` — found + not found
- Edge case: soft-deleted records (`isDeleted: true`) should 404

**`apps/worker/src/auth.test.ts`** (new)
- `requireAuth` — authenticated user → returns session + userId
- `requireAuth` — no session → 401
- `requireAuth` — expired session → 401
- `requireAuth` from cookie (fallback path when middleware didn't set context)

**`apps/worker/src/api/auth.ts`** — review existing `requireAuthContext` usage and ensure coverage

#### Medium Priority

**`apps/worker/src/programs/wendler531.test.ts`** (new)
- `calculateTrainingMax`
- `getPercentage` — standard + AMRAP
- `getWeekProgression` — week 1/2/3/4
- `getNextSession` — advance week/session correctly

**`apps/worker/src/programs/nuckols.test.ts`** (new)
- Template generation for all program variants (4-day, 3-day, etc.)

**`apps/worker/src/programs/stronglifts.test.ts`** (new)
- `generateStrongliftsTemplate` — structure validation
- Progression logic (5lb deadlift, 10lb squat)

**`apps/worker/src/whoop/webhook.test.ts`** (expand existing)
- Invalid signature → 401
- Missing fields → 400
- Workout webhook → correct DB insert
- Recovery webhook → correct DB insert
- Cycle webhook → correct DB insert

**`apps/worker/src/api/nutrition/entries.test.ts`** (new)
- `GET /api/nutrition/entries` — list entries for date range
- `POST /api/nutrition/entries` — create entry
- `PATCH /api/nutrition/entries/:id` — update entry (ownership check)
- `DELETE /api/nutrition/entries/:id` — soft delete (ownership check)

**`apps/worker/src/api/nutrition/daily-summary.test.ts`** (new)
- Aggregation of meals for a given date
- With and without training context

**`apps/worker/src/lib/timezone.test.ts`** (new)
- `toLocalDate` — various timezone offsets
- `parseDateWithTimezone`
- DST edge cases

#### Low Priority

**`apps/worker/src/utils/detect-ip.test.ts`** (new)
- Extract from `CF-Connecting-IP` header
- Fallback to `X-Forwarded-For`
- Missing headers → undefined

**`apps/worker/src/programs/utils.test.ts`** (new)
- `calculate1RM` (Epley, Brzycki)
- `calculateVolume`
- `groupSetsByExercise`

---

### Mocking Strategy

For API route tests, use a lightweight mock builder pattern (already established in `guards.test.ts`):

```typescript
function createDb(row: unknown) {
  const builder = {
    select: () => builder,
    from: () => builder,
    innerJoin: () => builder,
    where: () => builder,
    get: async () => row,
  };
  return builder;
}
```

For more complex scenarios, consider `vi.mock()` with `vi.hoisted()` for module-level mocks.

---

## Part 2: E2E Tests (Maestro + EAS Workflows)

### Maestro Flow Files

Create `apps/expo/.maestro/` directory with the following flows:

**`.maestro/common.yml`** — shared login flow
```yaml
appId: com.strength.app
---
- launchApp
- tapOn: 'Get Started'
- inputText: '${USER_EMAIL}' # env var or fixture
- inputText: '${USER_PASSWORD}'
- tapOn: 'Sign In'
- assertVisible: 'Home'
```

**`.maestro/home.yml`** — verify home screen loads key elements
```yaml
appId: com.strength.app
---
- launchApp
- assertVisible: 'Start Workout'
- assertVisible: 'Nutrition'
- assertVisible: 'Programs'
```

**`.maestro/workout-start.yml`** — start a workout from a template
```yaml
appId: com.strength.app
---
- launchApp
- tapOn: 'Start Workout'
- tapOn: 'Templates'
- tapOn: '.*Stronglifts.*'
- tapOn: 'Start Session'
- assertVisible: 'Workout'
```

**`.maestro/nutrition-log.yml`** — log a meal entry
```yaml
appId: com.strength.app
---
- launchApp
- tapOn: 'Nutrition'
- tapOn: 'Log Meal'
- inputText: 'Chicken breast'
- inputText: '200' # grams
- tapOn: 'Save'
- assertVisible: 'Logged'
```

### EAS Build Profile

Add to `apps/expo/eas.json`:

```json
{
  "build": {
    "e2e-test": {
      "withoutCredentials": true,
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": true
      }
    }
  }
}
```

### EAS Workflow

Create `.eas/workflows/e2e-test-android.yml`:

```yaml
name: e2e-test-android

on:
  pull_request:
    branches: ['*']

jobs:
  build_android_for_e2e:
    type: build
    params:
      platform: android
      profile: e2e-test

  maestro_test:
    needs: [build_android_for_e2e]
    type: maestro
    params:
      build_id: ${{ needs.build_android_for_e2e.outputs.build_id }}
      flow_path:
        - .maestro/home.yml
        - .maestro/workout-start.yml
        - .maestro/nutrition-log.yml
```

Create `.eas/workflows/e2e-test-ios.yml` similarly for iOS.

### Running Maestro Locally

For local development/testing (before committing):
```sh
maestro test apps/expo/.maestro/home.yml
maestro test apps/expo/.maestro/workout-start.yml
maestro test apps/expo/.maestro/nutrition-log.yml
```

Requires:
- Android emulator or iOS simulator running
- App installed (or use `maestro test --open` to launch)

---

## Part 3: CI/CD Updates

### GitHub Actions — `check.yml`

Add coverage reporting:

```yaml
- name: Unit Tests with Coverage
  run: bun run test -- --coverage

- name: Upload coverage to Codecov
  if: github.event == 'pull_request'
  uses: codecov/codecov-action@v4
  with:
    files: ./coverage/coverage-final.json
    fail_ci_if_error: false
```

**Note**: Requires `codecov` token in repo secrets. Alternatively, use `coveralls` or just upload artifacts.

### Optional: Dedicated E2E Workflow

`.github/workflows/e2e-test.yml` for manual triggering:

```yaml
name: E2E Tests

on:
  workflow_dispatch:
    inputs:
      platform:
        type: choice
        options: [android, ios, both]
        default: android

jobs:
  e2e-android:
    if: inputs.platform == 'android' || inputs.platform == 'both'
    steps:
      - uses: actions/checkout@v4
      - name: Run EAS build + Maestro
        run: |
          npm install -g eas-cli
          eas build --profile e2e-test --platform android
          # then run maestro
```

---

## Part 4: File Structure Summary

```
apps/expo/
├── .maestro/
│   ├── common.yml
│   ├── home.yml
│   ├── workout-start.yml
│   └── nutrition-log.yml
├── eas.json                    # add e2e-test build profile
└── .eas/
    └── workflows/
        ├── e2e-test-android.yml
        └── e2e-test-ios.yml

apps/worker/src/
├── auth.test.ts               # new — requireAuth coverage
├── programs/
│   ├── scheduler.test.ts      # new
│   ├── wendler531.test.ts     # new
│   ├── nuckols.test.ts        # new
│   ├── stronglifts.test.ts    # new
│   └── utils.test.ts           # new
├── whoop/
│   └── webhook.test.ts        # expand existing
├── api/
│   ├── guards.test.ts         # expand existing
│   └── nutrition/
│       ├── entries.test.ts    # new
│       └── daily-summary.test.ts # new
└── lib/
    └── timezone.test.ts       # new

vite.config.ts                 # add coverage config

.github/workflows/
├── check.yml                  # add coverage upload
└── e2e-test.yml               # optional manual workflow
```

---

## Implementation Order

1. **[ ]** Add Vitest coverage config to `vite.config.ts`
2. **[ ]** Write `apps/worker/src/programs/scheduler.test.ts` (pure functions, high value)
3. **[ ]** Expand `apps/worker/src/api/guards.test.ts` with missing ownership guards
4. **[ ]** Write `apps/worker/src/auth.test.ts` for `requireAuth`
5. **[ ]** Write `apps/worker/src/programs/wendler531.test.ts`
6. **[ ]** Expand `apps/worker/src/whoop/webhook.test.ts`
7. **[ ]** Write `apps/worker/src/api/nutrition/entries.test.ts`
8. **[ ]** Create `apps/expo/.maestro/` flows (home, workout-start, nutrition-log)
9. **[ ]** Add `e2e-test` build profile to `apps/expo/eas.json`
10. **[ ]** Create `.eas/workflows/e2e-test-android.yml`
11. **[ ]** Create `.eas/workflows/e2e-test-ios.yml`
12. **[ ]** Update `.github/workflows/check.yml` with coverage step
13. **[ ]** Run `bun run test -- --coverage` and verify thresholds

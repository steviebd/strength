# TODO: Comprehensive Exercise Type Support

## Background

The app currently forces every exercise through the same `weight × reps` interface. Cardio (Treadmill, Rowing, Bike) and bodyweight exercises (Push-ups, Pull-ups, Plank, Dips) have no proper logging UX. We need to add first-class support for exercise types with appropriate UI for weight, reps, time, distance, and height.

---

## Exercise Types

| Type | What user logs | Examples |
|---|---|---|
| `weighted` | weight + reps | Squat, Bench Press, Dumbbell Curl |
| `bodyweight` | reps (+ optional added weight) | Push-ups, Pull-ups, Dips, Burpees |
| `timed` | duration only | Plank, Wall Sit, L-sit |
| `cardio` | duration + optional distance | Treadmill, Rowing, Stationary Bike |
| `plyo` | reps + height | Box Jumps |

### Library Mappings

Implementation note: tag every item in `packages/db/src/exercise-library.ts` by existing `id`, not by copying this table verbatim. Some current library names differ from the table below (for example `Squat`, `Lat Pulldowns`, `Tricep Pushdowns`, `Leg Extensions`, `Leg Curls`, `Lateral Raises`, `Farmer's Walk`), and several listed names are not currently in the library. Default any unclassified existing or user-created exercise to `weighted`.

| Exercise | muscleGroup | exerciseType |
|---|---|---|
| Barbell Squat | Quads | weighted |
| Bench Press | Chest | weighted |
| Deadlift | Back | weighted |
| Overhead Press | Shoulders | weighted |
| Barbell Row | Back | weighted |
| Front Squat | Quads | weighted |
| Romanian Deadlift | Hamstrings | weighted |
| Incline Bench Press | Chest | weighted |
| Close-Grip Bench Press | Triceps | weighted |
| Pendlay Row | Back | weighted |
| Dumbbell Shoulder Press | Shoulders | weighted |
| Dumbbell Row | Back | weighted |
| Dumbbell Curl | Biceps | weighted |
| Skullcrushers | Triceps | weighted |
| Leg Press | Quads | weighted |
| Hack Squat | Quads | weighted |
| Hip Thrust | Glutes | weighted |
| Bulgarian Split Squat | Quads | weighted |
| Goblet Squat | Quads | weighted |
| Sumo Deadlift | Back | weighted |
| Deficit Deadlift | Back | weighted |
| Rack Pull | Back | weighted |
| Lat Pulldown | Back | weighted |
| Cable Row | Back | weighted |
| Face Pull | Shoulders | weighted |
| Lateral Raise | Shoulders | weighted |
| Leg Curl | Hamstrings | weighted |
| Leg Extension | Quads | weighted |
| Calf Raise | Calves | weighted |
| Seated Calf Raise | Calves | weighted |
| T-Bar Row | Back | weighted |
| Chest-Supported Row | Back | weighted |
| Preacher Curl | Biceps | weighted |
| Hammer Curl | Biceps | weighted |
| Tricep Pushdown | Triceps | weighted |
| Cable Fly | Chest | weighted |
| Arnold Press | Shoulders | weighted |
| Shrugs | Shoulders | weighted |
| Good Morning | Hamstrings | weighted |
| Glute Bridge | Glutes | weighted |
| Ab Wheel | Core | weighted |
| Weighted Crunch | Core | weighted |
| Russian Twist | Core | weighted |
| Farmer's Carry | Forearms | weighted |
| Wrist Curl | Forearms | weighted |
| Reverse Wrist Curl | Forearms | weighted |
| Pull-ups | Back | bodyweight |
| Dips | Chest | bodyweight |
| Push-ups | Chest | bodyweight |
| Burpees | Full Body | bodyweight |
| Plank | Core | timed |
| Box Jumps | Cardio | plyo |
| Treadmill | Cardio | cardio |
| Rowing Machine | Cardio | cardio |
| Stationary Bike | Cardio | cardio |

---

## 1. Schema Changes

### New Columns

**`exercises` table:**
- `exerciseType` / `exercise_type` — `text`, nullable initially then backfilled. Values: `weighted`, `bodyweight`, `timed`, `cardio`, `plyo`.

**`workoutSets` table:**
- `duration` — `integer` (seconds, nullable)
- `distance` — `integer` (meters, nullable)
- `height` — `integer` (cm, nullable) — for plyo

**`userPreferences` table:**
- `distanceUnit` / `distance_unit` — `text`, `'km' | 'mi'`, default `'km'`

**`templateExercises` table:**
- `exerciseType` / `exercise_type` — `text` (denormalized for quick UI reads)
- `targetDuration` / `target_duration` — `integer` (seconds, nullable)
- `targetDistance` / `target_distance` — `integer` (meters, nullable)
- `targetHeight` / `target_height` — `integer` (cm, nullable)

**Local Expo DB mirrors (`apps/expo/db/local-schema.ts`):**
- `localUserPreferences.distanceUnit`
- `localUserExercises.exerciseType`
- `localWorkoutExercises.exerciseType`
- `localWorkoutSets.duration`, `distance`, `height`
- `localTemplateExercises.exerciseType`, `targetDuration`, `targetDistance`, `targetHeight`

### Type Definitions to Update

```ts
// apps/worker/src/programs/types.ts
interface ProgramExercise {
  name: string;
  lift?: LiftType;
  sets: number;
  reps?: number;
  targetWeight?: number;
  targetDuration?: number;   // seconds
  targetDistance?: number;   // meters
  targetHeight?: number;     // cm (plyo)
  isAmrap?: boolean;
  libraryId?: string;
  exerciseType: ExerciseType;
}

type ExerciseType = 'weighted' | 'bodyweight' | 'timed' | 'cardio' | 'plyo';

// apps/expo/context/WorkoutSessionContext.tsx
interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  duration: number | null;   // seconds
  distance: number | null;   // meters
  height: number | null;     // cm
  isComplete: boolean;
  completedAt: string | null;
  createdAt: string | null;
}

interface WorkoutExercise {
  id: string;
  exerciseId: string;
  libraryId?: string | null;
  name: string;
  muscleGroup: string | null;
  exerciseType: string;       // ADD
  orderIndex: number;
  sets: WorkoutSet[];
  notes: string | null;
  isAmrap: boolean;
}
```

Current `ProgramExercise` requires `lift`/`reps`/`targetWeight` for generated lift work. The implementation should relax those fields only where needed for typed accessories or non-weighted exercises, without breaking existing linear program generators.

---

## 2. Duration Display & Input

### Display Formatting (re-use existing `formatDuration` pattern)

- `< 60s` → `45s`
- `60s – 3600s` → `5:30` (mm:ss)
- `> 3600s` → `1:15:30` (hh:mm:ss)

### Inline Set Row Stepper

- **Timed exercises (Plank, etc.)**: stepper increments `±5s`
- **Cardio — Rowing**: stepper increments `±15s`
- **Cardio — Treadmill / Bike**: stepper increments `±60s`
- Tap the displayed value → opens **DurationPickerModal**

### DurationPickerModal

- Opens as `Modal animationType="slide" presentationStyle="pageSheet"` (existing pattern)
- Large centered input using `TextInput` with `keyboardType="number-pad"`
- Three fields side-by-side for **hours**, **minutes**, **seconds**
- Each field has its own +/- buttons for fine adjustment
- Live preview of formatted duration above inputs
- Save / Cancel actions in footer using `ActionButton`

---

## 3. Distance Display & Input

### User Preference

- Stored in `user_preferences.distance_unit`: `'km'` or `'mi'`
- Add toggle in `Profile` screen, exactly like the existing `kg`/`lbs` toggle
- Default: `'km'`

### Display Formatting (meters → user unit)

- `< 1000m` when unit is `km` → `500m`
- `≥ 1000m` when unit is `km` → `5.0 km`
- `< 1609m` when unit is `mi` → `800m`
- `≥ 1609m` when unit is `mi` → `3.1 mi`

Use same conversion factor as existing weight logic (kg ↔ lbs): 1 mi = 1609.344 m.

### Inline Set Row Stepper

- Stepper increments `±100m` (or `±0.1 mi` when displayed in mi)
- Tap the displayed value → opens **DistancePickerModal**

### DistancePickerModal

- Opens as `Modal` with `pageSheet`
- Large centered `TextInput` with `keyboardType="decimal-pad"`
- Unit label (`km` or `mi`) next to input
- User always types in their **preferred unit**
- Convert to meters on save
- Save / Cancel footer

---

## 4. Height (Plyo) Display & Input

### Display Formatting (cm)

- Always stored as **cm**
- Display depends on user's **distance unit** preference:
  - `km` → show as `cm` (e.g., `60 cm`)
  - `mi` → convert to **inches** (e.g., `24 in`)

### Inline Set Row

- Reps stepper + Height stepper side by side
- Height stepper increments `±5 cm` (or `±2 in` for imperial)
- Tap value → **HeightPickerModal** (same pattern as DistancePickerModal)

---

## 5. Set Logger UI (`SetLogger.tsx`)

Each exercise type gets a different inline row layout:

### Weighted (existing — unchanged)
```
[−] 185 [+]  lbs    [−] 5 [+]  reps    [Complete]
```

### Bodyweight
```
[−] 12 [+]  reps    [Complete]
```
- Below the reps row, a small ghost `ActionButton`: "Add Weight"
- Tapping reveals the weight stepper (same as weighted), defaulting to `0`

### Timed
```
[−] 60s [+]  duration    [Complete]
```
- Single stepper group for duration
- `±5s` increments

### Cardio
```
[−] 25:00 [+]  duration    [−] 2.0 [+]  mi    [Complete]
```
- Two stepper groups side by side
- Left: duration (adaptive increments based on exercise)
- Right: distance in user's unit (optional — user can leave null)
- If distance is null, show placeholder "—" with `+` to add

### Plyo
```
[−] 10 [+]  reps    [−] 60 [+]  cm    [Complete]
```
- Reps + height side by side
- Height in user's unit (`cm` or `in`)

---

## 6. Exercise Logger Header (`ExerciseLogger.tsx`)

Update the header text to reflect the exercise type's target metrics:

- **Weighted**: `3 sets × 5 reps × 185 lbs` (existing)
- **Bodyweight**: `3 sets × 12 reps`
- **Timed**: `3 sets × 60s`
- **Cardio**: `1 set × 25:00` (distance shown if target set)
- **Plyo**: `3 sets × 10 reps × 60 cm`

---

## 7. Volume & Summary Stats

**Do NOT unify volume into a single number across types.** It is meaningless to compare "12,450 lbs" with "45:00". Instead, show type-specific summaries in the workout session header.

### Workout Session Header (`workout-session.tsx`)

Show multiple summary pills:
- If any weighted sets completed: **Volume: 12,450 lbs**
- If any timed/cardio sets completed: **Time: 45:00**
- If any cardio sets completed: **Distance: 5.0 km**
- Total sets completed: **Sets: 15**

### Volume Calculation Logic (per type)

| Type | Volume Formula |
|---|---|
| `weighted` | `weight × reps` |
| `bodyweight` | `reps` (only count reps; if added weight > 0, use `reps × weight`) |
| `timed` | `duration` (total seconds, displayed as formatted time) |
| `cardio` | `duration` (total seconds) |
| `plyo` | `reps` (height is metadata, not volume) |

---

## 8. Program & Template Support

### Program Types Update

```ts
interface ProgramExercise {
  name: string;
  lift?: LiftType;
  sets: number;
  reps?: number;
  targetWeight?: number;
  targetDuration?: number;
  targetDistance?: number;
  targetHeight?: number;
  isAmrap?: boolean;
  libraryId?: string;
  exerciseType: ExerciseType;
}
```

### Linear Programs (StrongLifts, etc.)

- Stay 100% unchanged — all exercises are `weighted`
- No new fields needed

### Accessories

- Accessories in `apps/worker/src/programs/accessory-data.ts` now include `exerciseType`
- Example: Plank accessory uses `exerciseType: 'timed'`, `targetDuration: 60`, `reps: undefined`
- Example: Box Jumps accessory uses `exerciseType: 'plyo'`, `reps: 10`, `targetHeight: 60`

### Template Editor

- Template exercise form needs a type selector (dropdown or segmented control)
- Fields shown conditionally based on selected type:
  - `weighted`: sets, reps, targetWeight
  - `bodyweight`: sets, reps, optional targetWeight
  - `timed`: sets, targetDuration
  - `cardio`: sets, targetDuration, optional targetDistance
  - `plyo`: sets, reps, targetHeight

---

## 9. Profile Screen Update (`profile.tsx`)

Add a new row under the existing **Weight Unit** toggle:

```
Distance Unit     [km] [mi]
```
- Same segmented control style
- Saves to `user_preferences.distance_unit` through `/api/profile/preferences`
- Workouts and exercise logging immediately reflect the change

---

## 10. API Updates

### `apps/worker/src/routes/workouts.ts`

- Accept `duration`, `distance`, `height` in set update/create payloads
- Validate that the fields match the exercise's `exerciseType`
- Return `duration`, `distance`, `height` in workout fetch responses

### `apps/worker/src/routes/profile.ts`

- Accept `distanceUnit` in profile update
- Return `distanceUnit` in profile fetch

### `apps/worker/src/routes/programs.ts` and `apps/worker/src/routes/program-cycles.ts`

- Persist `exerciseType`, `targetDuration`, `targetDistance`, `targetHeight` in program cycle workout `targetLifts` JSON and generated template exercise rows
- Return these fields when fetching program workouts

### `apps/worker/src/routes/templates.ts` and `apps/worker/src/routes/training.ts`

- Accept and return `exerciseType`, `targetDuration`, `targetDistance`, `targetHeight` for template exercises
- Include the new fields in training cache/template hydration queries

---

## 11. Migration & Backfill

### Migration

Generate a Drizzle migration adding:
- `exercises.exercise_type`
- `workout_sets.duration`
- `workout_sets.distance`
- `workout_sets.height`
- `user_preferences.distance_unit`
- `template_exercises.exercise_type`
- `template_exercises.target_duration`
- `template_exercises.target_distance`
- `template_exercises.target_height`

Also update Expo local migrations in `apps/expo/db/migrations.ts` for:
- `local_user_preferences.distance_unit`
- `local_user_exercises.exercise_type`
- `local_workout_exercises.exercise_type`
- `local_workout_sets.duration`, `distance`, `height`
- `local_template_exercises.exercise_type`, `target_duration`, `target_distance`, `target_height`

### Backfill Script

Run a one-time backfill on existing data:
1. For every `exercises` row with a `libraryId`, look up the library item and set `exerciseType`
2. For exercises without `libraryId` or unknown mapping, default to `'weighted'`
3. All existing `workoutSets` get `duration=null`, `distance=null`, `height=null` (already default)
4. All existing user preferences get `distanceUnit='km'`

---

## 12. Files to Modify (Checklist)

### DB
- [ ] `packages/db/src/schema.ts`
- [ ] `packages/db/src/exercise-library.ts` (add `exerciseType` to each item)
- [ ] `packages/db/drizzle/` (migration files)
- [ ] `apps/expo/db/local-schema.ts`
- [ ] `apps/expo/db/migrations.ts`
- [ ] `apps/expo/db/preferences.ts`
- [ ] `apps/expo/context/UserPreferencesContext.tsx`

### Worker
- [ ] `apps/worker/src/programs/types.ts`
- [ ] `apps/worker/src/programs/factory.ts`
- [ ] `apps/worker/src/programs/accessory-data.ts` (tag accessories with types)
- [ ] `apps/worker/src/programs/stronglifts.ts` (verify no changes needed)
- [ ] `apps/worker/src/routes/workouts.ts`
- [ ] `apps/worker/src/routes/profile.ts`
- [ ] `apps/worker/src/routes/programs.ts`
- [ ] `apps/worker/src/routes/program-cycles.ts`
- [ ] `apps/worker/src/routes/templates.ts`
- [ ] `apps/worker/src/routes/training.ts`

### Expo
- [ ] `apps/expo/context/WorkoutSessionContext.tsx`
- [ ] `apps/expo/components/workout/SetLogger.tsx`
- [ ] `apps/expo/components/workout/ExerciseLogger.tsx`
- [ ] `apps/expo/components/workout/WorkoutCard.tsx`
- [ ] `apps/expo/app/(app)/(workout-detail)/workout-session.tsx`
- [ ] `apps/expo/app/(app)/profile.tsx`
- [ ] `apps/expo/components/template/TemplateEditor/types.ts`
- [ ] `apps/expo/components/template/TemplateEditor/index.tsx`
- [ ] `apps/expo/hooks/useWorkoutSession.ts`
- [ ] `apps/expo/db/workouts.ts`
- [ ] `apps/expo/db/training-cache.ts`

### New Files
- [ ] `apps/expo/components/workout/DurationPickerModal.tsx`
- [ ] `apps/expo/components/workout/DistancePickerModal.tsx`
- [ ] `apps/expo/components/workout/HeightPickerModal.tsx`
- [ ] `apps/expo/lib/units.ts` (shared distance/height conversion helpers)

---

## Notes

- **RPE** exists in schema but is not exposed in UI yet. Do not touch it in this pass.
- Keep styling consistent with existing token system: `colors`, `spacing`, `radius`, `typography`, `layout.controlHeight`.
- All modals use `Modal animationType="slide" presentationStyle="pageSheet"`. No `@gorhom/bottom-sheet`.
- The weight unit (`kg`/`lbs`) and distance unit (`km`/`mi`) should be independent toggles in profile.

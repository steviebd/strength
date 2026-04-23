# Home Data & Program Scheduling PRD/PDR

## Goal

Finish the home page data work and complete program scheduling so the app has one coherent flow:

1. The user creates a program with schedule preferences.
2. The worker generates dated program sessions.
3. The Programs and Workouts screens expose the schedule using the existing page/card design.
4. The Home screen shows only the workout scheduled for the user's current local day.
5. Weekly progress, streak, and recovery data are real and timezone-correct.

## Current State

| Area | Status |
|------|--------|
| Home header date | Partially real; ignores stored timezone |
| Home today's workout | Placeholder |
| Home weekly stats | Placeholder |
| Home recovery snapshot | Placeholder; recovery hook exists, sleep is not included |
| Program schedule schema | Built |
| Program schedule generation | Partially built in worker program creation |
| Program schedule creation UI | Not built |
| Active program schedule UI | Not built |
| Specific scheduled workout start API | Not built |
| Reschedule flow | Not built |
| Smart/Strict program start | Not built |
| Program dashboard actions | Partially built; current app can continue/delete, but lacks full schedule dashboard actions |

## Product Decisions

1. Stored user timezone is authoritative.
   - Use `user_preferences.timezone` first.
   - If no stored timezone exists, use request/device timezone.
   - If neither exists, fall back to `UTC`.

2. Today's workout means a program workout scheduled for the user's current local date.
   - Do not show workouts from other days as today's workout.
   - If the user has an active program but no workout scheduled today, show Rest Day and the next scheduled workout.

3. Weekly progress uses Monday-Sunday calendar weeks in the resolved timezone.

4. Recovery snapshot should be served by a home-specific API response.
   - Do not overload `/api/nutrition/daily-summary`.
   - Query WHOOP recovery, cycle/strain, and sleep directly for the home summary.
   - Share WHOOP data fetching logic with `nutrition/daily-summary` to reduce duplication.

5. Program scheduling must be visible and editable enough to be useful.
   - Program creation must collect schedule preferences.
   - Active programs must show current-week schedule.
   - Individual scheduled sessions must be startable.
   - Rescheduling can be minimal, but the data model and API should support it.

6. Program start should support two schedule alignment modes.
   - Smart Start: first session can occur on the selected start date even if it is not a preferred gym day.
   - Strict Start: first session occurs on the first selected gym day on or after the selected start date.

## Design Requirements

Reuse the existing app visual system. Do not introduce a new page style for scheduling.

Required primitives:

- Use `PageLayout` for all screens and modal-like full pages.
- Use `PageHeader` for tab screens such as Programs, Workouts, and Home.
- Use `CustomPageHeader` only for pushed/detail screens that need a back action.
- Use `Surface` for cards and grouped content.
- Use `SectionTitle` for schedule sections like "This Week", "Upcoming", and "Schedule".
- Use `Badge` for session status: Today, Complete, Missed, Rest Day, Upcoming.
- Use `MetricTile` for summary values: workouts this week, streak, volume, sessions remaining.
- Use `ActionButton` for primary/secondary card actions.

Programs page design direction:

- Preserve the current `Programs` page header: `PageHeader eyebrow="Training Programs" title="Programs"`.
- Active program cards should remain visually aligned with existing `Surface`/card patterns, not custom one-off button styling.
- Schedule setup should be part of the existing start-program modal flow, after 1RM inputs.
- Schedule display should look like the active program card pattern from Workouts/Home, with compact dated rows inside `Surface`.

## Reference App Feature Model

Reference inspected: `/Users/steven/workout`.

Use the feature ideas, not the UI implementation. The reference app is web/TanStack and uses a different component system. The Expo app should redesign the experience for native mobile while preserving the same product capabilities.

Useful reference concepts:

- Program start is a multi-step flow:
  - Step 1: enter or confirm 1RM values.
  - Step 2: configure schedule.
  - Step 3: review program and schedule before creating the cycle.
- Schedule configuration includes:
  - exact training-day count validation based on `program.daysPerWeek`
  - day-of-week selection
  - preferred time of day: morning, afternoon, evening
  - program start date
- Review includes a start-mode decision when the selected start date does not align with the first selected training day:
  - Smart Start: first session starts on the selected date and the schedule adapts.
  - Strict Start: the first scheduled session follows the selected training-day pattern.
- Program dashboard includes:
  - progress summary
  - current/today workout summary
  - start today's/current workout action
  - update 1RM action
  - end program and create 1RM test action
  - delete program action
  - weekly schedule list
- Weekly schedule includes:
  - previous/next week navigation
  - Today shortcut
  - seven day rows, including rest days
  - scheduled workout row with time, completion state, and start/open action
  - reschedule action per scheduled workout
- Reschedule flow:
  - choose a new date
  - preserve the specific program-cycle workout identity
  - refetch current workout and schedule after save
- Nutrition/training context can infer training day from a program workout scheduled for that date.

Feature decisions for this app:

- Adopt the three-step start flow concept, but implement it inside the current native Programs flow or a native pushed screen.
- Adopt weekly schedule and rest-day visibility.
- Adopt Smart Start vs Strict Start, because it resolves ambiguous start-date behavior.
- Adopt specific scheduled-workout start.
- Adopt per-workout reschedule.
- Do not copy web layout, typography, icons, or card styling from `/Users/steven/workout`.

## Data Model

Existing fields are sufficient for MVP:

- `user_program_cycles.preferred_gym_days`
- `user_program_cycles.preferred_time_of_day`
- `user_program_cycles.program_start_date`
- `user_program_cycles.first_session_date`
- `program_cycle_workouts.scheduled_date`
- `program_cycle_workouts.scheduled_time`
- `program_cycle_workouts.scheduled_timezone`

Future optional additions (skip for MVP):

| Field | Reason |
|-------|--------|
| `program_cycle_workouts.original_scheduled_date` | Preserve generated date after user reschedules |
| `program_cycle_workouts.rescheduled_at` | Audit schedule changes |
| `program_cycle_workouts.reschedule_reason` | Optional future UX |

## API Plan

### Timezone Resolver

Add a stored-timezone-first resolver in `apps/worker/src/lib/timezone.ts`.

Precedence:

1. Stored `user_preferences.timezone`
2. Valid request timezone
3. `UTC`

Use this resolver for home summary and program scheduling APIs. Consider migrating all route handlers later if this behavior should be global.

### Home Summary

Create `GET /api/home/summary?timezone=<iana>`.

Response:

```typescript
{
  date: {
    localDate: string;
    timezone: string;
    formatted: string;
  };
  todayWorkout: {
    workout: HomeScheduledWorkout | null;
    nextWorkout: HomeNextWorkout | null;
    hasActiveProgram: boolean;
    isRestDay: boolean;
  };
  weeklyStats: {
    workoutsCompleted: number;
    workoutsTarget: number;
    streakDays: number;
    totalVolume: number;
    totalVolumeLabel: string;
  };
  recoverySnapshot: {
    sleepDurationLabel: string | null;
    sleepPerformancePercentage: number | null;
    recoveryScore: number | null;
    recoveryStatus: 'green' | 'yellow' | 'red' | null;
    strain: number | null;
    isWhoopConnected: boolean;
  };
}
```

`HomeScheduledWorkout`:

```typescript
{
  cycleWorkoutId: string;
  workoutId: string | null;
  name: string;
  focus: string;
  exercises: string[];
  programName: string;
  programCycleId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  scheduledTimezone: string;
  isComplete: boolean;
}
```

Logic:

1. Resolve local date using stored-timezone-first logic.
2. Query active program cycles.
3. Query `program_cycle_workouts` scheduled for `localDate`.
4. Return today's scheduled row only if one exists.
5. If no scheduled row exists and active program exists, return Rest Day plus next future scheduled row.
6. Compute weekly stats for Monday-Sunday using `completedLocalDate`.
7. Query WHOOP recovery/cycle/sleep for the current local date range.

### Program Schedule Summary

Create `GET /api/programs/cycles/:id/schedule?timezone=<iana>`.

Response:

```typescript
{
  cycle: {
    id: string;
    name: string;
    timezone: string;
    currentWeek: number | null;
    currentSession: number | null;
    totalSessionsCompleted: number;
    totalSessionsPlanned: number;
  };
  thisWeek: ProgramScheduleWorkout[];
  upcoming: ProgramScheduleWorkout[];
  completed: ProgramScheduleWorkout[];
}
```

Status rules:

- `today`: scheduled date equals the resolved local date and the row is incomplete.
- `upcoming`: scheduled date is after the resolved local date and the row is incomplete.
- `missed`: scheduled date is before the resolved local date and the row is incomplete.
- `complete`: row is complete or linked workout is completed.
- `unscheduled`: no scheduled date exists.

`ProgramScheduleWorkout`:

```typescript
{
  cycleWorkoutId: string;
  workoutId: string | null;
  weekNumber: number;
  sessionNumber: number;
  name: string;
  exercises: string[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduledTimezone: string | null;
  status: 'today' | 'upcoming' | 'complete' | 'missed' | 'unscheduled';
}
```

### Start Specific Scheduled Workout

Create `POST /api/programs/cycle-workouts/:cycleWorkoutId/start`.

Body:

```typescript
{
  timezone?: string;
}
```

Behavior:

1. Verify the cycle workout belongs to the authenticated user.
2. If a non-deleted `workoutId` already exists, return it.
3. If that workout is completed, return `completed: true`.
4. Otherwise create a workout from that specific cycle workout row.
5. Link `program_cycle_workouts.workout_id`.
6. Return `{ workoutId, sessionName, created, completed, programCycleId }`.

This should not depend on `currentWeek/currentSession`. Home needs to start the workout scheduled today, even if the program pointer is stale.

Support optional actual date:

```typescript
{
  timezone?: string;
  actualDate?: string; // YYYY-MM-DD, default: resolved local today
}
```

If `actualDate` differs from the row's scheduled date, use it as the workout's started local date but do not silently reschedule the row unless the product explicitly chooses "start now means move to today". Prefer preserving scheduled date and recording the real workout start date on the workout.

### Reschedule Workout

Create `PUT /api/programs/cycle-workouts/:cycleWorkoutId/schedule`.

Body:

```typescript
{
  scheduledDate: string;
  scheduledTime?: string | null;
  timezone?: string;
}
```

Validation:

- `scheduledDate` must be `YYYY-MM-DD`.
- `scheduledTime` must be `HH:mm` or null.
- Date belongs to the user's resolved timezone.
- Cycle workout belongs to the authenticated user.
- MVP can allow collisions but should return a warning flag if another session is already scheduled on that date.

Response:

```typescript
{
  workout: ProgramScheduleWorkout;
  warning?: 'date_collision';
}
```

## Program Creation Scheduling Flow

Add schedule inputs to the existing start-program modal in `apps/expo/app/(app)/programs.tsx`.

Placement:

1. Keep current program details and 1RM inputs.
2. Add a `SectionTitle title="Schedule"` section below 1RM inputs.
3. Use `Surface` cards for each schedule setting.
4. Keep the same modal/page visual language and button styling.

Inputs:

| Input | Default | Notes |
|-------|---------|-------|
| Preferred training days | Program default days per week, starting Mon/Wed/Fri for 3-day programs and Mon/Tue/Thu/Fri for 4-day programs | Use day chips |
| Preferred time | Morning | Options: Morning, Afternoon, Evening |
| Program start date | Today in stored timezone | Local date |
| Start mode | Smart Start | Show when start date is not one of the selected training days |
| First session date | Derived from start mode | Smart: selected start date; Strict: first selected training day on/after start date |

UX rules:

- Enforce selected day count equals the program's `daysPerWeek`.
- If the user changes preferred days, recompute first session date unless they manually overrode it.
- Show a full schedule preview covering the entire program duration (no cap on sessions).
- Start button remains disabled until 1RMs and schedule are valid.
- Show a review step before creating the program.
- The review step should summarize duration, total sessions, frequency, selected training days, preferred time, start date, and first session date.
- If Smart/Strict choice is shown, require a choice before enabling Start Program.

Payload to existing `POST /api/programs`:

```typescript
{
  programSlug,
  name,
  squat1rm,
  bench1rm,
  deadlift1rm,
  ohp1rm,
  preferredGymDays: ['monday', 'wednesday', 'friday'],
  preferredTimeOfDay: 'morning',
  programStartDate: '2026-04-23',
  firstSessionDate: '2026-04-24',
  timezone: activeTimezone
}
```

Implementation note:

- `startMode` is client-side only. The client computes `firstSessionDate` based on the user's Smart/Strict choice and sends only that result.
- The reference app at `/Users/steven/workout` does not persist `startMode`, only the computed `firstSessionDate`.

## Active Program Schedule UI

Add schedule visibility without creating a disconnected design.

Programs tab:

- Active program card shows:
  - Program name
  - Week/session progress
  - Next scheduled session
  - Action buttons: Continue, View Schedule, Delete
- `View Schedule` opens a pushed/detail route or full-screen modal using `PageLayout` and `CustomPageHeader`.

Workouts tab:

- Keep the existing "Active programs" section.
- Add the next scheduled workout date/time inside each active program card.
- Continue Workout still starts current session.
- If a workout is scheduled today, label it with `Badge label="Today" tone="orange"`.

Home tab:

- Today's Workout card uses `/api/home/summary`.
- If a scheduled workout exists today, `Start Workout` calls the specific scheduled-workout start endpoint.
- If rest day, show a `Rest Day` badge and next scheduled workout.

Schedule detail screen:

- Route: `apps/expo/app/program-schedule.tsx` or `apps/expo/app/program-schedule/[cycleId].tsx` depending on router conventions.
- Header: `CustomPageHeader title="Program Schedule"`.
- Sections:
  - `MetricTile` row for Completed, Remaining, This Week
  - `SectionTitle title="This Week"`
  - `SectionTitle title="Upcoming"`
  - Optional `SectionTitle title="Completed"`
- Each session row uses `Surface`, `Badge`, and `ActionButton`.

Session row actions:

- Start: starts the specific `cycleWorkoutId`.
- Open: opens existing workout if `workoutId` exists.
- Reschedule: opens a small date/time editor.

Weekly schedule behavior:

- Render all seven days from Monday to Sunday.
- Days without a workout should explicitly show Rest Day.
- Include previous/next week navigation.
- Include a Today shortcut that jumps to the week containing today's date.
- Show scheduled time when available.
- Use status badges:
  - Today
  - Complete
  - Missed
  - Upcoming
  - Rest Day

Program dashboard actions:

- Continue/Start Workout: starts the current incomplete workout or today's scheduled workout depending on entry point.
- View Schedule: opens schedule detail.
- Update 1RM Values: existing or new route for changing program maxes.
- End Program & Test 1RM: completes the cycle and creates/opens a 1RM test workout.
- Delete Program: keep destructive confirmation.

## Reschedule UX

MVP reschedule can be simple:

- Open from a schedule row.
- Show current date and time.
- Allow selecting a new local date and preferred time bucket.
- Save calls `PUT /api/programs/cycle-workouts/:cycleWorkoutId/schedule`.
- Refetch home summary, active programs, and program schedule queries.

Do not automatically shift all future workouts in MVP. Rescheduling one workout changes only that workout. Add a future enhancement for "shift following sessions".

Date picker behavior:

- Offer a quick list/grid for the next 60 days.
- Allow manual date entry/selection when native date picker support is available.
- Do not allow dates before the program start date unless explicitly supporting backfill.
- Keep scheduled time unchanged unless the user edits it.

## Weekly Progress Rules

Use Monday-Sunday local week.

Workout query:

- `userId = session.user.id`
- `isDeleted = false`
- `completedAt IS NOT NULL`
- `completedLocalDate >= weekStart`
- `completedLocalDate <= weekEnd`

Streak:

- Current streak is consecutive local calendar days ending today.
- If today has no completed workout, return `0`.
- Multiple workouts on one date count as one streak day.

Target:

- If active program exists, count scheduled program workouts in the Monday-Sunday week.
- If no active program exists, default to `3`.

## Recovery Snapshot Rules

Use home summary endpoint.

Data:

- Recovery: `whoop_recovery` record in local date range.
- Sleep: most recent `whoop_sleep` record ending in local date range.
- Strain: `whoop_cycle` record in local date range.

Fallback UI:

- WHOOP disconnected: show `--` values and "Connect WHOOP".
- WHOOP connected but no data: show `--` values and "No data synced".
- API error: show cached/stale UI if available, otherwise muted fallback.

## Implementation Phases

**Important**: Phase 1 (API Foundation) must be completed and verified before starting Phases 2, 3, or 4, as they depend on the API endpoints.

### Phase 1: Program Schedule API Foundation

Files:

- `apps/worker/src/lib/timezone.ts`
- `apps/worker/src/api/programs/schedule.ts` or existing program route module
- `apps/worker/src/index.ts`

Work:

1. Add stored-timezone-first resolver (already exists in `timezone.ts` - verify it's complete).
2. Add schedule summary endpoint.
3. Add start-specific-cycle-workout endpoint.
4. Add reschedule endpoint.
5. Add focused tests if existing worker test setup supports route-level tests.

### Phase 2: Program Creation Schedule UI

Files:

- `apps/expo/app/(app)/programs.tsx`
- Optional: `apps/expo/components/program/SchedulePicker.tsx`
- Optional: `apps/expo/components/program/SchedulePreview.tsx`
- Optional: `apps/expo/components/program/ProgramReview.tsx`

Work:

1. Convert start-program flow into three steps: 1RMs, Schedule, Review.
2. Add schedule state to start-program modal or pushed setup screen.
3. Add day chips and time selection using existing colors, badges, and surfaces.
4. Add start-date selection and Smart/Strict start handling.
5. Add schedule preview in the review step.
6. Include schedule fields in `POST /api/programs`.
7. Preserve current header and page layout.

### Phase 3: Active Program Schedule UI

Files:

- `apps/expo/hooks/useProgramSchedule.ts`
- `apps/expo/app/program-schedule.tsx` or route equivalent
- `apps/expo/app/(app)/programs.tsx`
- `apps/expo/app/(app)/workouts.tsx`

Work:

1. Add `useProgramSchedule`.
2. Add schedule detail screen with `PageLayout` and `CustomPageHeader`.
3. Add "View Schedule" to active program cards.
4. Show next scheduled session in active cards.
5. Add reschedule modal/editor.
6. Add weekly schedule navigation, Today shortcut, explicit rest-day rows, and status badges.
7. Add Update 1RM and End Program & Test 1RM actions if they are not already available in mobile.

### Phase 4: Home Summary

Files:

- `apps/worker/src/api/home/summary.ts`
- `apps/expo/hooks/useHomeSummary.ts`
- `apps/expo/app/(app)/home.tsx`
- `apps/worker/src/index.ts`

Work:

1. Add home summary endpoint.
2. Add React Query hook.
3. Replace hardcoded header date, workout card, weekly metrics, and recovery snapshot.
4. Start today's scheduled workout through specific cycle workout start endpoint.
5. Use existing Home card styles and primitives.

### Phase 5: Verification

Run:

```bash
bun run check
bun run test
```

Manual cases:

- User with no stored timezone.
- User with stored timezone different from device timezone.
- Active program with workout scheduled today.
- Active program with rest day today.
- Active program with missed past workout.
- Reschedule workout to today and confirm Home updates.
- Start scheduled workout from Home.
- Start scheduled workout from Program Schedule.
- WHOOP disconnected.
- WHOOP connected with recovery but no sleep.
- Start program with valid exact day count.
- Confirm Review is disabled until 1RMs and schedule are valid.
- Smart Start creates first session on selected start date.
- Strict Start creates first session on first selected training day.
- Weekly schedule shows seven days and rest days.
- Previous/next week navigation changes visible schedule.
- Today shortcut jumps to the week containing today.
- Reschedule a workout and verify Home updates if moved to today.

## Acceptance Criteria

Home:

- Header date uses stored timezone.
- No placeholder workout, weekly, or recovery values remain.
- Today's workout only appears when scheduled today.
- Rest day state appears when active program has no session today.
- Weekly stats use Monday-Sunday and completed local dates.

Program scheduling:

- Starting a program includes schedule preferences.
- Starting a program is a guided flow with 1RMs, Schedule, and Review.
- Schedule validation requires exactly `daysPerWeek` selected days.
- Smart Start and Strict Start produce different first session dates when applicable.
- Generated schedule is visible after program creation.
- Active program cards show next scheduled workout.
- Weekly schedule shows rest days and status for every day in the displayed week.
- A specific scheduled workout can be started.
- A scheduled workout can be rescheduled.
- Home reflects rescheduled workouts without special-case logic.

Design:

- Programs, schedule detail, home, and workout cards reuse existing primitives.
- Headers remain consistent with current app patterns.
- No new visual system or divergent page layout is introduced.

## Files To Create Or Modify

New files:

| File | Purpose |
|------|---------|
| `apps/expo/hooks/useHomeSummary.ts` | Home summary query |
| `apps/expo/hooks/useProgramSchedule.ts` | Program schedule query/mutations |
| `apps/expo/components/program/SchedulePicker.tsx` | Reusable schedule input UI |
| `apps/expo/components/program/SchedulePreview.tsx` | Reusable schedule preview UI |
| `apps/expo/app/program-schedule.tsx` | Active program schedule detail screen |
| `apps/worker/src/api/home/summary.ts` | Home summary endpoint |
| `apps/worker/src/api/programs/schedule.ts` | Program schedule endpoints if extracting from `index.ts` |

Modified files:

| File | Changes |
|------|---------|
| `apps/expo/app/(app)/home.tsx` | Replace placeholders and start scheduled workouts |
| `apps/expo/app/(app)/programs.tsx` | Add schedule setup and View Schedule action |
| `apps/expo/app/(app)/workouts.tsx` | Show next scheduled active program session |
| `apps/worker/src/index.ts` | Mount new routes |
| `apps/worker/src/lib/timezone.ts` | Stored-timezone-first resolver (verify completeness) |
| `packages/db/src/schema.ts` | No changes required for MVP |
| `packages/db/drizzle/migrations/*` | No migrations needed for MVP |

# UI/UX Rebuild Plan

**Project:** Strength Training App (`@strength/expo`, Expo SDK 55)
**Date:** 2026-04-22
**Status:** Implementation complete

## 12. Resolved Decisions

These are locked and no longer open questions.

- **Auth shell**: keep `auth-shell.tsx` as layout-only wrapper; each screen manages its own state inline
- **Theme tokens**: use hex values from §6.1 as canonical palette (no `PlatformColor`)
- **Tab icons**: Ionicons defaults — home=grid, workouts=dumbbell, programs=list, nutrition=restaurant, profile=person
- **WHOOP callback redirect**: back to profile/preferences where the connect button lives
- **Icons**: one cross-platform set everywhere, no SF Symbols
- **Headers**: prefer native `Stack.Screen` headers; no `Header.tsx`/`ModalHeader.tsx` (delete or reduce to genuinely necessary local utilities)
- **Modals**: all become full-screen routes or pushed stack screens, no reusable `BottomSheet.tsx`
- **PlatformColor**: deferred — use fixed dark palette for now

## 13. Implementation Tasks

### Phase 1 — Config & Dependency Cleanup
- [x] **T1**: Remove `import '@/global.css'` from `apps/expo/app/_layout.tsx`
- [x] **T2**: Remove `withReactNativeCSS(...)` from `apps/expo/metro.config.js`
- [x] **T3**: Remove `nativewind-env.d.ts` from `apps/expo/tsconfig.json` include
- [x] **T4**: Remove Tailwind dependencies from `apps/expo/package.json`
- [x] **T5**: Remove Tailwind dependencies from root `package.json`
- [x] **T6**: Reinstall with `bun install` to refresh `bun.lock`
- [x] **T7**: Delete Tailwind/NativeWind files (§5.1)

### Phase 2 — Theme & Primitives
- [x] **T8**: Create `apps/expo/theme.ts` with colors, spacing, radius, typography, layout tokens
- [x] **T9**: Rebuild `apps/expo/components/ui/Screen.tsx`
- [x] **T10**: Rebuild `apps/expo/components/ui/Button.tsx`
- [x] **T11**: Rebuild `apps/expo/components/ui/Input.tsx`
- [x] **T12**: Rebuild `apps/expo/components/ui/Card.tsx`
- [x] **T13**: Rebuild `apps/expo/components/ui/Collapsible.tsx`
- [x] **T14**: Rebuild `apps/expo/components/ui/app-primitives.tsx` (standardize icons to Ionicons)
- [x] **T15**: Delete `apps/expo/components/themes/dark-bold.tsx` once consumers are gone
- [x] **T16**: Delete `apps/expo/components/ui/Header.tsx`, `apps/expo/components/ui/ModalHeader.tsx`, `apps/expo/components/ui/BottomSheet.tsx`

### Phase 3 — Auth
- [x] **T17**: Rebuild `apps/expo/components/auth-shell.tsx` (layout-only, no internal state)
- [x] **T18**: Rebuild `apps/expo/app/auth/sign-in.tsx`
- [x] **T19**: Rebuild `apps/expo/app/auth/sign-up.tsx`

### Phase 4 — Navigation Layout
- [x] **T20**: Rebuild `apps/expo/app/(app)/_layout.tsx` (tab bar with Ionicons, whoop hidden)
- [x] **T21**: Rebuild `apps/expo/app/_layout.tsx` (wrap with theme providers if needed)

### Phase 5 — App Screens
- [x] **T22**: Rebuild `apps/expo/app/(app)/home.tsx`
- [x] **T23**: Rebuild `apps/expo/app/(app)/workouts.tsx`
- [x] **T24**: Rebuild `apps/expo/app/(app)/programs.tsx`
- [x] **T25**: Rebuild `apps/expo/app/(app)/nutrition.tsx`
- [x] **T26**: Rebuild `apps/expo/app/(app)/profile.tsx`
- [x] **T27**: Rebuild `apps/expo/app/(app)/whoop.tsx`
- [x] **T28**: Rebuild `apps/expo/app/index.tsx` (redirect/root)
- [x] **T29**: Rebuild `apps/expo/app/program-1rm-test.tsx`
- [x] **T30**: Rebuild `apps/expo/app/whoop-callback.tsx`

### Phase 6 — Workout & Template Components
- [x] **T31**: Rebuild `apps/expo/components/workout/WorkoutCard.tsx`
- [x] **T32**: Rebuild `apps/expo/components/workout/SetLogger.tsx`
- [x] **T33**: Rebuild `apps/expo/components/workout/ExerciseLogger.tsx`
- [x] **T34**: Rebuild `apps/expo/components/workout/ExerciseSearch.tsx`
- [x] **T35**: Rebuild `apps/expo/components/workout/TemplateCard.tsx`
- [x] **T36**: Rebuild `apps/expo/components/workout/ActiveWorkoutBanner.tsx`
- [x] **T37**: Rebuild `apps/expo/components/template/TemplateList.tsx`
- [x] **T38**: Rebuild `apps/expo/components/template/TemplateEditor.tsx`
- [x] **T39**: Rebuild `apps/expo/components/template/TemplateEditor/index.tsx`
- [x] **T40**: Rebuild `apps/expo/components/template/TemplateExerciseRow.tsx`
- [x] **T41**: Rebuild `apps/expo/components/template/ExercisePicker.tsx`
- [x] **T42**: Rebuild `apps/expo/app/workout-session.tsx`

### Phase 7 — Nutrition Components
- [x] **T43**: Rebuild `apps/expo/components/nutrition/MacroProgressBar.tsx`
- [x] **T44**: Rebuild `apps/expo/components/nutrition/MealCard.tsx`
- [x] **T45**: Rebuild `apps/expo/components/nutrition/SaveMealDialog.tsx`
- [x] **T46**: Rebuild `apps/expo/components/nutrition/WhoopNutritionCard.tsx`
- [x] **T47**: Rebuild `apps/expo/app/nutrition/chat.tsx`

### Phase 8 — Final Cleanup & Verification
- [x] **T48**: Verify no `@/tw` imports or `className` props remain
- [x] **T49**: Run `bun run check` and fix all errors/warnings
- [x] **T50**: Final code review for errors and incomplete items

## 8. Suggested Implementation Order

## 1. Goal

Redo the Expo app UI after the Tailwind/NativeWind refactor drifted into an unstable state.

This plan is for a reviewer and implementer. It should answer three questions clearly:

1. What must be removed to fully unwind Tailwind/NativeWind?
2. What files still depend on the current styling stack?
3. What UX outcomes define "done" beyond "the app compiles"?

## 2. Non-goals

- Do not change API contracts, auth flows, or worker logic unless required by a UI bug.
- Do not redesign navigation structure unless a reviewer explicitly approves it.
- Do not introduce custom native code or anything that breaks Expo Go.

## 3. Approved Product Decisions

These are no longer open questions.

- Lean harder on Expo Router stack headers. `Header.tsx` and `ModalHeader.tsx` should be removed unless a screen proves it needs a narrowly scoped local wrapper.
- Move modal flows toward route presentation patterns, not a custom reusable `BottomSheet.tsx`.
- Use one cross-platform icon system. Do not introduce an iOS-only SF Symbols path for the main app UI.
- Treat this rebuild as both a styling migration and a UX improvement pass. Layout density, hierarchy, and screen states should improve.
- Keep `whoop` hidden from the main tab bar. Surface WHOOP entry points from the preferences/profile area as it works today.

## 4. Critical Corrections To The Original Draft

These points were missing or inaccurate in the first pass and must be resolved before anyone starts implementation.

### 4.1 Build/config work is larger than just deleting Tailwind files

Removing Tailwind requires changes in all of these places, not just component files:

- `apps/expo/app/_layout.tsx`
  Remove `import '@/global.css';`
- `apps/expo/metro.config.js`
  Remove `withReactNativeCSS(...)` and return the default Expo Metro config
- `apps/expo/tsconfig.json`
  Remove `nativewind-env.d.ts` from `include`
- `apps/expo/package.json`
  Remove Expo-app-level Tailwind dependencies
- `package.json`
  Remove duplicated root-level Tailwind dependencies
- `bun.lock`
  Refresh lockfile after dependency removal

If those changes are not included, the app will still reference the CSS pipeline even after the UI files are migrated.

### 4.2 The migration surface is bigger than the original inventory

There are currently **39 files** in `apps/expo` still using `@/tw` or `className`.

The original draft missed at least these files:

- `apps/expo/components/auth-shell.tsx`
- `apps/expo/app/_layout.tsx`
- `apps/expo/metro.config.js`
- `apps/expo/tsconfig.json`
- `package.json`

### 4.3 The icon plan is incomplete

The original draft only covered tab icons and assumed an SF Symbols migration. That is no longer the plan.

Ionicons are also used in:

- `apps/expo/app/(app)/home.tsx`
- `apps/expo/components/ui/app-primitives.tsx`

That means the correct direction is:

- standardize on one cross-platform icon system for iOS and Android
- prefer keeping the current `@expo/vector-icons` usage unless the team explicitly chooses another single icon library
- avoid an iOS-only `expo-image` + SF Symbols path for the core navigation and shared primitives

Also note:

- `expo-haptics` is **not** installed today, so do not list it as "already in dependencies".

### 4.4 The theme strategy must pick one direction

The earlier draft mixed two incompatible ideas:

- a fixed dark brand palette
- `PlatformColor(...)` driven system colors with fallback copies

For this app, the better default is:

- use a fixed dark token set in `apps/expo/theme.ts`
- keep the palette intentionally branded
- do not use `PlatformColor` unless a reviewer explicitly wants platform-adaptive colors

Reason:

- `app.json` already sets `userInterfaceStyle` to `"dark"`
- the app is not currently designed as a dark/light adaptive product
- `PlatformColor(...) ?? fallback` makes the theme harder to reason about and review

### 4.5 Custom headers and sheets are now migration targets, not rebuild targets

Because the approved direction is to lean on Expo Router stack headers and route presentation:

- `Header.tsx` should be deleted or reduced to a very narrow, screen-local helper only if absolutely necessary
- `ModalHeader.tsx` should be deleted
- `BottomSheet.tsx` should be deleted

The migration should prefer:

- `Stack.Screen` titles and header actions
- route-based presentation for editing, creation, and detail flows
- full-screen task flows where keyboard-heavy editing is involved

## 5. Current State Inventory

### 5.1 Tailwind/NativeWind files to remove

- `apps/expo/global.css`
- `apps/expo/tailwind.config.js`
- `apps/expo/postcss.config.mjs`
- `apps/expo/tw.ts`
- `apps/expo/nativewind-env.d.ts`
- `apps/expo/src/tw/index.tsx`
- `apps/expo/src/tw/image.tsx`
- `apps/expo/src/tw/animated.tsx`

### 5.2 Dependency cleanup

Remove these from both `apps/expo/package.json` and root `package.json` where present:

- `@tailwindcss/postcss`
- `nativewind`
- `react-native-css`
- `tailwind-merge`
- `tailwindcss`
- `clsx`

Reinstall with Bun so `bun.lock` is updated.

### 5.3 Config files to modify

- `apps/expo/app/_layout.tsx`
- `apps/expo/metro.config.js`
- `apps/expo/tsconfig.json`
- `apps/expo/babel.config.js`

Notes:

- `apps/expo/babel.config.js` is likely already correct. Keep `react-native-worklets/plugin`.
- `apps/expo/metro.config.js` is not optional. It currently wraps Metro with `react-native-css`.

## 6. Implementation Scope

### 6.1 Shared UI foundation

Create `apps/expo/theme.ts` with:

- `colors`
- `spacing`
- `radius`
- `typography`
- `layout`

Recommended rule:

- keep tokens simple and literal
- no `PlatformColor`
- no duplicate `fallback` keys

Example structure:

```ts
export const colors = {
  background: '#0a0a0a',
  surface: '#18181b',
  surfaceAlt: '#27272a',
  border: '#3f3f46',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  accent: '#ef6f4f',
  accentSecondary: '#fb923c',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
};
```

### 6.2 Visual Direction And Look & Feel

This rebuild should feel like a serious strength logbook, not a generic wellness dashboard.

The intended visual character is:

- dense, structured, and calm under pressure
- high-contrast and readable on a gym floor
- performance-first, with numbers and progression treated as the primary content
- branded, but restrained

Research-informed direction:

- Apple’s layout and typography guidance favors strong visual hierarchy, consistent spacing, and readable text scaling.
- Apple’s charting guidance emphasizes glanceable summaries with room to inspect details when needed.
- Apple’s CareKit guidance explicitly recommends refined, unobtrusive branding for health and wellness experiences.
- Current strength apps that resonate with serious lifters tend to position themselves as fast logbooks, not social feeds or gamified wellness products.

Concrete design rules:

- One dominant surface per screen.
  The top card or hero module should answer the main question for that screen immediately.
- Secondary metrics should sit in compact tiles.
  Use small metric cards for streak, volume, recovery, calories, compliance, or recent performance.
- Lists should read like a training notebook.
  Rows should be compact, aligned, and optimized for scanning rather than decorative spacing.
- Numbers should feel stronger than labels.
  Use large, tabular numerals for weight, reps, calories, streaks, and percentages.
- Copy should be terse and coach-like.
  Favor short labels such as `Top Set`, `Volume`, `Recovery`, `Today's Plan`, `Last Session`, `Ready`, `Missed`, `Edit`.
- Color should be semantic, not decorative.
  Use coral/orange for actions and progression, emerald for positive recovery or completion, amber for caution, red for failure or destructive states.
- Surfaces should look matte and durable.
  Prefer near-black backgrounds, slightly lifted charcoal surfaces, subtle borders, and restrained shadow.
- Motion should be brief and purposeful.
  Use small transitions for state changes, logging completion, and route presentation. Avoid flashy gamification.
- Progress celebration should be understated.
  PRs and wins should feel earned: highlight them with a tight accent treatment, not confetti or novelty effects.
- Empty states should be instructive.
  Every empty state should explain what is missing and offer one clear next action.
- Loading states should preserve hierarchy.
  Skeletons or placeholders should keep the same card and list rhythm as the loaded screen.

Recommended screen personality by area:

- Home: command center
  One strong hero card, then compact summary tiles, then short action lanes.
- Workout session: cockpit
  Highest density in the app. Large tappable inputs, tight set rows, sticky controls, clear completion states.
- Programs/templates: planning board
  Structured cards, readable progression blocks, and less visual noise than live workout screens.
- Nutrition: analytical but not clinical
  Macro summaries and meal rows should feel informative and simple, not like a spreadsheet.
- Profile/preferences: utility-first
  Plain grouped lists and settings rows. WHOOP entry belongs here, not in the tab bar.

Things to avoid:

- wellness-app gradients everywhere
- oversized empty padding that wastes vertical space
- rainbow metric colors without semantic meaning
- multiple competing hero cards on one screen
- decorative icons where the number or action matters more
- social-feed styling

### 6.3 Shared UI components to rebuild

- `apps/expo/components/ui/Screen.tsx`
- `apps/expo/components/ui/Button.tsx`
- `apps/expo/components/ui/Input.tsx`
- `apps/expo/components/ui/Card.tsx`
- `apps/expo/components/ui/Collapsible.tsx`
- `apps/expo/components/ui/app-primitives.tsx`
- `apps/expo/components/themes/dark-bold.tsx`
  Delete this once all consumers are gone

Delete rather than rebuild:

- `apps/expo/components/ui/Header.tsx`
- `apps/expo/components/ui/ModalHeader.tsx`
- `apps/expo/components/ui/BottomSheet.tsx`

### 6.4 Auth and shell components to rebuild

- `apps/expo/components/auth-shell.tsx`
- `apps/expo/app/auth/sign-in.tsx`
- `apps/expo/app/auth/sign-up.tsx`

Important:

- the auth screens are only partially migrated today
- they still import primitives from `@/tw`
- `auth-shell.tsx` is a real part of the migration scope and must not be skipped

### 6.5 Nutrition UI to rebuild

- `apps/expo/components/nutrition/MacroProgressBar.tsx`
- `apps/expo/components/nutrition/MealCard.tsx`
- `apps/expo/components/nutrition/SaveMealDialog.tsx`
- `apps/expo/components/nutrition/WhoopNutritionCard.tsx`
- `apps/expo/app/(app)/nutrition.tsx`
- `apps/expo/app/nutrition/chat.tsx`

### 6.6 Workout and template UI to rebuild

- `apps/expo/components/workout/WorkoutCard.tsx`
- `apps/expo/components/workout/SetLogger.tsx`
- `apps/expo/components/workout/ExerciseLogger.tsx`
- `apps/expo/components/workout/ExerciseSearch.tsx`
- `apps/expo/components/workout/TemplateCard.tsx`
- `apps/expo/components/workout/ActiveWorkoutBanner.tsx`
- `apps/expo/components/template/TemplateList.tsx`
- `apps/expo/components/template/TemplateEditor.tsx`
- `apps/expo/components/template/TemplateEditor/index.tsx`
- `apps/expo/components/template/TemplateExerciseRow.tsx`
- `apps/expo/components/template/ExercisePicker.tsx`
- `apps/expo/app/(app)/workouts.tsx`
- `apps/expo/app/workout-session.tsx`

### 6.7 Remaining route files to rebuild

- `apps/expo/app/(app)/home.tsx`
- `apps/expo/app/(app)/programs.tsx`
- `apps/expo/app/(app)/profile.tsx`
- `apps/expo/app/(app)/whoop.tsx`
- `apps/expo/app/index.tsx`
- `apps/expo/app/program-1rm-test.tsx`
- `apps/expo/app/whoop-callback.tsx`

### 6.8 Navigation, headers, and route presentation

- `apps/expo/app/(app)/_layout.tsx`

Approved direction:

- keep tabs as `home / workouts / programs / nutrition / profile`
- keep `whoop` hidden behind `href: null`
- link WHOOP from the profile/preferences surface, not the tab bar
- use a single cross-platform icon system for tabs and shared primitives
- move modal-style flows toward route presentation patterns
- prefer native stack headers over custom in-screen header components

Presentation guidance:

- keyboard-heavy edit/create flows should be full-screen routes with native headers
- short confirmations should stay inline or use platform dialogs sparingly
- avoid rebuilding a generic reusable bottom sheet system

## 7. UX Acceptance Criteria

This was mostly missing before. The rebuild should be reviewed against actual UX outcomes, not just styling syntax.

### 7.1 Global quality bar

- Every screen respects top and bottom safe areas.
- Every scrollable screen has correct bottom padding above the tab bar.
- Keyboard interactions are safe on auth, workout logging, and nutrition chat flows.
- Tap targets are at least comfortably usable on mobile.
- Loading, empty, and error states are visually intentional.
- Typography, spacing, and border radii are consistent across screens.
- No screen depends on Tailwind class strings or `@/tw`.
- The app feels materially more focused and usable than before, not just visually restyled.

### 7.2 Navigation quality bar

- Tab bar spacing and height feel correct on devices with and without home indicators.
- Tabs use one consistent icon system across iOS and Android.
- Back actions and dismiss actions are consistent for modal-like screens.
- Preference and settings screens are not promoted into bottom navigation destinations.

### 7.3 Data-state quality bar

- Home screen cards still communicate hierarchy clearly after migration.
- Workout logging remains dense but readable while editing sets.
- Nutrition chat remains usable with long messages and keyboard open.
- Empty template, empty workout, and empty nutrition states are explicit and not visually collapsed.

### 7.4 Accessibility baseline

- Text contrast remains readable against all dark surfaces.
- Important controls expose `accessibilityRole` where appropriate.
- Text inputs keep visible focus and disabled states.
- Numeric and status values remain legible without relying only on color.

## 8. Phase Summary (for reference)

1. Remove Tailwind/CSS wiring from config and dependencies. → T1–T7
2. Add `theme.ts`. → T8
3. Rebuild shared primitives. → T9–T16
4. Delete custom header and sheet abstractions. → T16
5. Rebuild `auth-shell.tsx` and auth routes. → T17–T19
6. Rebuild tabs, stack headers, and route-level layouts. → T20–T21
7. Rebuild home, nutrition, workout, and template flows. → T22–T47
8. Standardize icons across the app. → handled in T14
9. Delete leftover Tailwind helpers and dead theme files. → T7, T15, T16
10. Run verification and device checks. → T48–T50

## 9. Reviewer Checklist

### 9.1 Codebase cleanup

- [ ] No `@/tw` imports remain
- [ ] No `className` props remain in Expo app code
- [ ] `global.css` is removed and no longer imported
- [ ] `react-native-css` is removed from Metro config
- [ ] `nativewind-env.d.ts` is removed from TypeScript include
- [ ] Tailwind dependencies are removed from both package manifests
- [ ] `Header.tsx`, `ModalHeader.tsx`, and `BottomSheet.tsx` are removed or reduced to genuinely necessary local utilities

### 9.2 App behavior

- [ ] `bun run check` passes
- [ ] `bun run dev:expo` starts successfully from the repo root
- [ ] Expo Go boot works without custom native changes
- [ ] Tab bar renders correctly on iOS and Android
- [ ] Auth screens still submit and redirect correctly
- [ ] Workout session editing still functions
- [ ] Nutrition chat still sends messages and displays responses
- [ ] WHOOP remains accessible from preferences/profile and is not exposed as a bottom tab destination

### 9.3 Visual QA

- [ ] Home, workouts, nutrition, programs, profile, and whoop screens look coherent as one product
- [ ] Cards, badges, buttons, and inputs share one visual language
- [ ] Empty, loading, and error states are present where needed
- [ ] The dark theme is intentional, not just "unstyled black"
- [ ] The app reads as a serious strength tracker: compact, confident, and data-forward

## 10. Commands

Use repo conventions, not ad-hoc commands:

```bash
bun run check
bun run dev:expo
```

Notes:

- `bun run dev:expo` already wraps Expo with `infisical run --env=dev`
- do not document `npx expo start` as the main local workflow for this repo

## 11. Research Notes

This visual direction is an inference from current mobile UI guidance and current strength-tracking product patterns.

- Apple HIG emphasizes visual hierarchy, readable typography, and layout consistency for mobile interfaces.
- Apple’s charting guidance supports glanceable summaries plus deeper inspection for data-heavy screens.
- Apple’s health/wellness guidance favors subtle branding over attention-seeking decoration.
- Material guidance reinforces keeping bottom navigation limited to a small set of true top-level destinations and warns against using it for settings/preferences.
- Current strength trackers are converging on fast logging, compact rows, strong metric visibility, inline timers, and understated progress feedback rather than social or overly gamified UI.

Reference links:

- Apple HIG Typography: https://developer.apple.com/design/human-interface-guidelines/typography
- Apple HIG Layout: https://developer.apple.com/design/human-interface-guidelines/layout
- Apple HIG Charting Data: https://developer.apple.com/design/human-interface-guidelines/charting-data
- Apple HIG CareKit: https://developer.apple.com/design/human-interface-guidelines/carekit
- Material bottom navigation guidance: https://m1.material.io/components/bottom-navigation.html
- Material dialog guidance: https://m1.material.io/components/dialogs.html
- Tracked • Strength Training App: https://apps.apple.com/us/app/tracked-strength-training/id6450913418
- Strong Workout Tracker Gym Log App: https://apps.apple.com/us/app/id464254577
- Logbook: Strength Training Log: https://apps.apple.com/jp/app/logbook-strength-training-log/id6761714460

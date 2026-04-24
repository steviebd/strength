# UI/UX Polish PDR

## Summary

The Expo application has useful shared UI pieces, but they are not yet authoritative. Several screens use local button, card, color, spacing, and typography styles instead of shared primitives. This creates visual drift, inconsistent text hierarchy, inconsistent card density, and responsive bugs such as action buttons wrapping on narrow devices.

This document defines the work required to uplift the app UI into a consistent, polished, responsive interface. The first implementation pass should focus on shared primitives and the highest-traffic training flows: Home, Workouts/Templates, and Active Workout logging.

## Goals

- Standardize the visual system across screens.
- Reduce hardcoded colors, sizes, spacing, and one-off component styles.
- Prevent button text wrapping and height changes across common phone widths.
- Make Active Workout set logging more spacious and easier to use.
- Improve consistency of text size, line height, spacing, and component alignment.
- Create reusable primitives so future screens do not regress into one-off styling.
- Preserve existing behavior and navigation while improving layout and presentation.

## Non-Goals

- No major information architecture rewrite.
- No changes to backend API contracts.
- No new authentication or data model behavior.
- No full brand redesign beyond tightening the current dark/orange strength app direction.
- No animation-heavy redesign unless it directly improves usability.

## Current State

### Shared Theme

Primary file:

- `apps/expo/theme.ts`

The theme currently defines:

- `colors`
- `spacing`
- `radius`
- `typography`
- `layout`
- a small `globalStyles` object

Issues:

- Colors are mostly raw values without semantic aliases.
- Alpha colors are repeated locally across components.
- Typography tokens are simple sizes, not usage roles.
- `layout.cardPadding`, `layout.screenPadding`, and `spacing` are not used consistently.
- Radius tokens exist, but screens still use hardcoded `10`, `12`, `16`, `24`, `9999`, etc.

### Shared UI Primitives

Primary files:

- `apps/expo/components/ui/Button.tsx`
- `apps/expo/components/ui/Card.tsx`
- `apps/expo/components/ui/Input.tsx`
- `apps/expo/components/ui/PageLayout.tsx`
- `apps/expo/components/ui/Screen.tsx`
- `apps/expo/components/ui/CustomPageHeader.tsx`
- `apps/expo/components/ui/app-primitives.tsx`

Issues:

- There are competing primitives:
  - `Button` and `ActionButton`
  - `Card` and `Surface`
  - `CustomPageHeader` and `PageHeader`
  - raw `TextInput` and shared `Input`
  - raw `Pressable` action controls
- `app-primitives.tsx` hardcodes many colors and values that should come from the theme.
- `ActionButton` does not enforce no-wrap behavior for labels.
- `ActionButton` has no responsive layout policy for long labels.
- `Button` and `ActionButton` have different radii, heights, text sizes, and pressed states.
- `Card` and `Surface` have different background, radius, border, and padding rules.

### High-Traffic Screens

Primary files:

- `apps/expo/app/(app)/home.tsx`
- `apps/expo/app/(app)/workouts.tsx`
- `apps/expo/app/workout-session.tsx`
- `apps/expo/components/workout/ExerciseLogger.tsx`
- `apps/expo/components/workout/SetLogger.tsx`
- `apps/expo/components/template/TemplateList.tsx`
- `apps/expo/components/template/TemplateEditor.tsx`
- `apps/expo/app/(app)/programs.tsx`
- `apps/expo/app/program-schedule.tsx`

Issues:

- Home action rows use equal-width buttons that can wrap on narrow devices.
- Workouts and active programs use longer labels such as `Start custom workout`, `Start next session`, and `View Schedule` in horizontal rows.
- Active Workout uses a fixed absolute header and hardcoded scroll top padding.
- Set logging gives Weight/Reps small input boxes instead of using available card width.
- Template cards use hardcoded sizes and raw delete icons.
- Programs and schedule screens contain many local chip, button, card, and modal styles.

### Supporting Screens

Primary files:

- `apps/expo/app/(app)/nutrition.tsx`
- `apps/expo/components/nutrition/*`
- `apps/expo/app/(app)/profile.tsx`
- `apps/expo/app/(app)/whoop.tsx`
- `apps/expo/components/profile/*`
- `apps/expo/app/auth/sign-in.tsx`
- `apps/expo/app/auth/sign-up.tsx`
- `apps/expo/components/auth-shell.tsx`

Issues:

- Profile uses local card and button styling instead of shared primitives.
- WHOOP screen still uses `Card` rather than the newer `Surface` pattern.
- Auth screens use many inline style objects.
- Nutrition is closer to the newer primitive direction, but still contains local action, empty-state, and card styles.
- Several screens use hardcoded brand and chart colors outside the theme.

## Design System Requirements

### Theme Tokens

Expand `apps/expo/theme.ts` with semantic tokens.

Required categories:

- Background:
  - `background.app`
  - `background.elevated`
  - `background.subtle`
  - `background.inset`
- Surface:
  - `surface.default`
  - `surface.muted`
  - `surface.raised`
  - `surface.selected`
  - `surface.danger`
  - `surface.success`
  - `surface.warning`
- Border:
  - `border.default`
  - `border.subtle`
  - `border.strong`
  - `border.focus`
  - `border.danger`
  - `border.success`
- Text:
  - `text.primary`
  - `text.secondary`
  - `text.tertiary`
  - `text.inverse`
  - `text.danger`
  - `text.success`
  - `text.warning`
- Accent:
  - `accent.primary`
  - `accent.primaryPressed`
  - `accent.secondary`
  - `accent.subtle`
- Data/status:
  - `status.success`
  - `status.warning`
  - `status.danger`
  - `status.info`
  - `status.neutral`
- Charts:
  - `chart.blue`
  - `chart.purple`
  - `chart.gray`
  - `chart.orange`
  - `chart.green`
  - `chart.red`

Compatibility requirement:

- Keep existing exported names such as `colors.background`, `colors.surface`, `colors.accent`, etc. until all screens are migrated.
- Add semantic tokens without breaking existing imports.

### Typography Roles

Add text roles to `theme.ts`.

Required roles:

- `display`
- `screenTitle`
- `screenSubtitle`
- `sectionTitle`
- `cardTitle`
- `body`
- `bodySmall`
- `caption`
- `eyebrow`
- `button`
- `buttonSmall`
- `metricValue`
- `metricLabel`
- `input`

Each role should define:

- `fontSize`
- `lineHeight`
- `fontWeight`
- optional `letterSpacing`
- optional `textTransform`

Rules:

- Do not scale font size with viewport width.
- Use stable role sizes.
- Use `lineHeight` for multiline copy.
- Avoid negative letter spacing.
- Use uppercase only for short labels such as metric labels and form labels.

### Spacing and Radius

Keep current spacing tokens but standardize usage:

- `xs = 4`
- `sm = 8`
- `md = 16`
- `lg = 24`
- `xl = 32`
- `xxl = 48`

Add layout-specific tokens:

- `layout.screenPadding`
- `layout.screenPaddingCompact`
- `layout.cardPadding`
- `layout.cardPaddingCompact`
- `layout.sectionGap`
- `layout.rowGap`
- `layout.controlHeight`
- `layout.controlHeightSmall`
- `layout.minTouchTarget`

Radius rules:

- Cards: `radius.lg` unless dense/list cards need `radius.md`.
- Inputs: `radius.md`.
- Buttons: `radius.md` or `radius.lg`, not `radius.xl` unless intentionally pill-shaped.
- Badges and avatars: `radius.full`.
- Avoid arbitrary radii like `10`, `12`, `16`, `24`, except when captured in tokens.

## Primitive Component Requirements

### Button

Create or consolidate into one authoritative button primitive.

Target file:

- `apps/expo/components/ui/Button.tsx`

Required API:

```typescript
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label?: string;
  children?: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  numberOfLines?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}
```

Behavior requirements:

- Button text must default to `numberOfLines={1}`.
- Long labels should ellipsize instead of wrapping.
- Button height must remain stable.
- Button content should use `minWidth: 0` and `flexShrink: 1` where needed.
- Loading state should preserve button dimensions.
- Icon spacing should be consistent.
- Disabled state should reduce opacity without changing dimensions.
- Pressed state should not cause layout shift.
- Touch target should be at least 44px high.

Migration:

- Replace `ActionButton` usages or make `ActionButton` a thin compatibility wrapper around `Button`.
- Replace local raw `Pressable` buttons screen by screen.

### IconButton

Add a shared icon-only button.

Required API:

```typescript
interface IconButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  variant?: 'ghost' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  onPress?: () => void;
}
```

Behavior requirements:

- Enforce stable square dimensions.
- Use accessibility label.
- Use Ionicons instead of text glyphs such as `✕`, `×`, `›`, `▲`, `▼`, `🗑`.

### Surface / Card

Consolidate `Card` and `Surface`.

Target files:

- `apps/expo/components/ui/Card.tsx`
- `apps/expo/components/ui/app-primitives.tsx`

Required API:

```typescript
type SurfaceTone = 'default' | 'muted' | 'inset' | 'selected' | 'success' | 'warning' | 'danger';
type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

interface SurfaceProps {
  tone?: SurfaceTone;
  padding?: SurfacePadding;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}
```

Behavior requirements:

- Standardize border, background, radius, and padding.
- Make `Card` either re-export `Surface` or become the single primitive.
- Avoid nested card visuals unless the inner element is a true repeated item or modal/tool area.

### Text

Add shared text primitives or helpers.

Options:

- `AppText`
- `Heading`
- `BodyText`
- `MutedText`
- `Label`
- `MetricText`

Requirements:

- Text should map to typography roles.
- Common screen text should stop hand-picking font sizes.
- Text should support `numberOfLines` and `ellipsizeMode`.

### Form Field

Improve `Input` into a reusable text field.

Required API:

```typescript
interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightSlot?: React.ReactNode;
}
```

Requirements:

- Standard label style.
- Standard input height.
- Consistent border/focus/error states.
- Multiline support.
- No screen-specific raw `TextInput` unless layout truly requires it.

### Badge / Chip

Keep `Badge`, but move tone colors into `theme.ts`.

Add `Chip` or extend `Badge` for selectable chips.

Requirements:

- Standard selected and unselected states.
- Standard pill radius and padding.
- Standard icon support.
- No hardcoded `rgba` values in chip components.

### MetricTile

Update `MetricTile` to handle narrow devices.

Requirements:

- Keep stable tile dimensions.
- Allow labels and hints to truncate.
- Use semantic metric typography roles.
- Support compact variant.
- Avoid large `marginTop` values that create inconsistent rhythm.

## Screen Requirements

## Home

Primary file:

- `apps/expo/app/(app)/home.tsx`

Problems:

- Workout actions are in a fixed horizontal row.
- Quick Access rows mix full-card press behavior and nested action button press behavior.
- Local title and subtitle sizes are larger than comparable cards elsewhere.
- Recovery and metric rows can feel cramped on narrow devices.

Requirements:

- Use shared `Button` for `Start Workout`, `Start Next`, `Programs`, `Open`, and `Manage`.
- Prevent action button text wrapping.
- On narrow devices, stack the workout action buttons vertically or use compact labels.
- Replace local hardcoded alpha colors with theme surface tokens.
- Ensure the workout title and subtitle use shared text roles.
- Ensure exercise list rows have stable spacing and no text overlap.
- Make Quick Access cards follow one interaction pattern:
  - Either whole card is pressable and the trailing control is an icon/chevron.
  - Or only the button is pressable.
- Prefer whole-card pressable rows for Quick Access.
- Add truncation rules for `workoutTitle`, `workoutSubtitle`, and exercise names.

Acceptance criteria:

- No Home button label wraps at 320px width.
- Quick Access cards have consistent height and alignment.
- Recovery Snapshot badges do not collide with status text.
- Home uses no raw hardcoded `rgba` colors except through theme tokens.

## Workouts

Primary file:

- `apps/expo/app/(app)/workouts.tsx`

Problems:

- Active program action rows can wrap or crowd.
- Quick Start actions use long labels in a two-column row.
- Active program surfaces use slate-blue local background.
- Modal uses local raw `TextInput` and close glyph.
- Empty/loading/error states are local and inconsistent.

Requirements:

- Use shared `Button`, `IconButton`, `Surface`, and `TextField`.
- Replace `Start custom workout` with a no-wrap button, and stack if narrow.
- Replace `Start next session`, `1RM Test`, `View Schedule` row with responsive action layout:
  - Primary action full width.
  - Secondary actions either two equal columns or stacked below 360px.
- Replace close `✕` with `IconButton`.
- Replace modal field with shared `TextField`.
- Use theme semantic surface tokens.
- Standardize empty, loading, and error states.

Acceptance criteria:

- Active program controls do not wrap at 320px.
- Quick Start card stays balanced at 320, 360, 393, and 430px widths.
- Modal styling matches other modal headers.

## Active Workout

Primary files:

- `apps/expo/app/workout-session.tsx`
- `apps/expo/components/workout/ExerciseLogger.tsx`
- `apps/expo/components/workout/SetLogger.tsx`

Problems:

- Header uses absolute positioning and fixed `topPadding: 170 + insets.top`.
- Action buttons are locally styled.
- SetLogger gives Weight/Reps too little room.
- SetLogger has text glyphs for completion and delete.
- Debug logs are still present.
- ExerciseLogger uses text arrows.

Requirements:

### Header

- Replace local action buttons with shared `Button`.
- Make fixed header height measured or layout-driven instead of relying on hardcoded `170`.
- Long workout names should truncate to one or two lines without overlapping duration.
- Duration should remain aligned and readable.
- Header buttons should not wrap.

### Exercise Cards

- Use shared `Surface`.
- Replace expand/collapse text arrows with `IconButton` or Ionicons.
- Use shared `Badge` for AMRAP.
- Use standard text roles.
- Remove debug logging from render paths.

### SetLogger Redesign

Current problem:

- Weight/Reps labels are placed beside controls.
- Labels reserve width while controls remain small.
- Input min width is only `stepperSize * 2`.
- Card width is underused.

Target layout:

Normal phone width:

```text
+------------------------------------+
| Set 1                              |
|                                    |
| Weight                             |
| [-]        102.5 kg           [+]  |
|                                    |
| Reps                               |
| [-]          5                [+]  |
|                                    |
| [ Mark Complete                 ]  |
+------------------------------------+
```

Compact alternative:

```text
+------------------------------------+
| 1        Weight        Reps        |
|          102.5 kg      5           |
|          [-] [+]       [-] [+]     |
| [ Mark Complete                 ]  |
+------------------------------------+
```

Preferred implementation:

- Use vertical stacked controls for clarity.
- Make value press targets full width between stepper buttons.
- Increase input button flex to consume available horizontal space.
- Use consistent minimum touch target.
- Use Ionicons for plus/minus/check/trash where possible.
- Preserve keyboard edit behavior.
- Preserve kg/lbs conversion behavior.

Acceptance criteria:

- Weight and Reps controls use most of the set card width.
- Controls remain usable at 320px.
- No set card content overlaps at 320px.
- Complete button remains stable in height.
- Delete control is icon-only and aligned.
- No debug `console.log` calls remain in Active Workout render paths.

## Templates

Primary files:

- `apps/expo/components/template/TemplateList.tsx`
- `apps/expo/components/template/TemplateEditor.tsx`
- `apps/expo/components/template/TemplateExerciseRow.tsx`
- `apps/expo/components/template/ExercisePicker.tsx`
- `apps/expo/components/template/TemplateEditor/index.tsx`

Problems:

- Template cards hardcode sizes and use raw delete glyphs.
- There are multiple template editor implementations.
- Exercise row controls use local styling and text glyphs.
- Exercise picker has many local colors, chips, and buttons.

Requirements:

- Confirm which TemplateEditor implementation is active and remove or deprecate unused duplicate code if safe.
- Use shared `Surface`, `Button`, `IconButton`, `TextField`, `Badge`, and selectable `Chip`.
- Replace `🗑`, `×`, `✓`, and text-only add/remove controls with icons.
- Standardize template empty state.
- Standardize exercise row spacing and control sizes.
- Make template card title and exercise count responsive.

Acceptance criteria:

- Template list cards visually match Workouts history cards.
- Template actions do not wrap at 320px.
- Exercise picker chips have consistent selected/unselected styling.
- No active template UI uses raw text glyph buttons.

## Programs

Primary files:

- `apps/expo/app/(app)/programs.tsx`
- `apps/expo/app/program-schedule.tsx`
- `apps/expo/app/program-1rm-test.tsx`

Problems:

- Program cards, schedule chips, day chips, modals, and buttons are mostly local.
- Program selection and active program cards have inconsistent density.
- Schedule session rows use multiple actions in horizontal rows.
- Modal controls duplicate chip/button styling.

Requirements:

- Use shared primitives for program cards, active program cards, schedule rows, and modals.
- Standardize difficulty badges via theme status/chip tokens.
- Make long program names truncate cleanly.
- Stack schedule row actions below narrow width.
- Use shared `Chip` for gym days, preferred time, date options, and time options.
- Use shared `TextField` for 1RM inputs.
- Replace local delete buttons with shared danger `Button` or `IconButton`.

Acceptance criteria:

- Program list and active program cards use same card styling family.
- Schedule action rows do not wrap at 320px.
- 1RM modal input cards align consistently and keep stable height.

## Nutrition

Primary files:

- `apps/expo/app/(app)/nutrition.tsx`
- `apps/expo/components/nutrition/*`

Problems:

- Nutrition is closer to the newer primitive direction but still has local quick action wrapping, assistant card styles, and chart colors.

Requirements:

- Use shared responsive button group for quick prompts.
- Move nutrition status/chart colors into theme chart/status tokens.
- Standardize empty chat state with shared empty-state component.
- Ensure quick prompt labels do not wrap awkwardly.
- Ensure chat input and embedded card spacing matches the rest of the app.

Acceptance criteria:

- Quick prompts are readable and stable at 320px.
- Assistant section visually matches other app surfaces.
- No local chart/status colors unless defined in theme.

## Profile

Primary file:

- `apps/expo/app/(app)/profile.tsx`

Problems:

- Profile cards and buttons are locally styled.
- WHOOP brand button uses raw color.
- Row layouts may truncate inconsistently.
- Settings rows use text chevrons.

Requirements:

- Use shared `Surface`, `Button`, `IconButton`, `TextField`, and settings row components.
- Move WHOOP brand color into theme as an external brand token.
- Replace text chevrons with Ionicons.
- Replace local button variants with shared variants.
- Ensure account email and timezone values truncate predictably.

Acceptance criteria:

- Profile cards match app card styling.
- All settings rows align and truncate consistently.
- WHOOP button styling is tokenized.

## WHOOP Data

Primary file:

- `apps/expo/app/(app)/whoop.tsx`

Problems:

- Uses `Card` while much of app uses `Surface`.
- Chart colors are local.
- Dense data rows may crowd at narrow widths.

Requirements:

- Consolidate `Card` and `Surface`.
- Move chart colors into theme.
- Make metrics wrap or stack for narrow widths.
- Keep charts readable on 320px width.

Acceptance criteria:

- WHOOP screen uses consolidated surface styling.
- Charts do not overflow at 320px.

## Auth

Primary files:

- `apps/expo/app/auth/sign-in.tsx`
- `apps/expo/app/auth/sign-up.tsx`
- `apps/expo/components/auth-shell.tsx`

Problems:

- Auth screens contain many inline styles.
- Inputs and buttons differ from app primitives.

Requirements:

- Move inline styles to StyleSheet or shared primitives.
- Use shared `TextField` and `Button`.
- Keep auth shell visually consistent with app surfaces.
- Preserve current sign-in/sign-up behavior.

Acceptance criteria:

- No large inline style blocks remain in auth forms.
- Auth buttons and fields match app primitives.

## Responsive Requirements

Test at these viewport widths:

- 320px
- 360px
- 393px
- 430px

Device/font scenarios:

- Android default font scale.
- Android increased font scale if practical.
- iOS safe area if practical.
- Keyboard open states for Active Workout, Nutrition, and modal forms.

Rules:

- Primary and secondary action labels must not wrap.
- Text must not overlap adjacent controls.
- Cards should not change height unexpectedly when pressing controls.
- Tap targets should remain at least 44px.
- Horizontal rows with multiple controls should stack or compact below narrow thresholds.
- Long names should truncate rather than force layout breakage.

## Implementation Plan

### Phase 1: Foundation

- Expand `theme.ts` with semantic tokens and typography roles.
- Consolidate `Button` and `ActionButton`.
- Add `IconButton`.
- Consolidate `Card` and `Surface`.
- Improve `Input` into `TextField`.
- Update `Badge`, `MetricTile`, and `SegmentedTabs` to use theme tokens.
- Add responsive utility helpers:
  - `useIsCompactWidth`
  - `responsiveActionRow` styles or a shared `ButtonGroup`

Deliverable:

- Shared primitives are available and backwards compatible.
- Existing screens compile with minimal migration.

### Phase 2: Home and Workouts

- Migrate Home to shared primitives.
- Fix Home workout action row wrapping.
- Fix Quick Access interaction pattern.
- Migrate Workouts quick start and active programs.
- Fix active program action rows.
- Migrate Start Workout modal.

Deliverable:

- Home and Workouts screens have consistent card/button/text styles.
- No action wrapping in these screens at target widths.

### Phase 3: Active Workout

- Refactor fixed header spacing.
- Migrate header action buttons.
- Remove debug logging in workout session render paths.
- Update ExerciseLogger iconography and styles.
- Redesign SetLogger controls.
- Verify weight/reps editing behavior.

Deliverable:

- Active Workout feels more spacious and consistent.
- Weight/Reps use more of the card.
- Header does not collide with content across common device sizes.

### Phase 4: Templates and Programs

- Migrate TemplateList cards/actions.
- Migrate active TemplateEditor implementation.
- Migrate ExercisePicker and TemplateExerciseRow controls.
- Migrate Programs cards, chips, modals, and actions.
- Migrate Program Schedule rows and reschedule modal.
- Migrate Program 1RM test screen.

Deliverable:

- Training setup and template management share the same visual system.

### Phase 5: Nutrition, Profile, WHOOP, Auth

- Migrate Nutrition quick actions, empty states, chart/status colors.
- Migrate Profile cards, buttons, rows, and chevrons.
- Migrate WHOOP data cards and chart colors.
- Migrate auth forms away from inline styles.

Deliverable:

- Supporting screens align with the main training flows.

### Phase 6: Cleanup and Guardrails

- Remove unused duplicate primitives if safe.
- Remove unused duplicate TemplateEditor implementation if safe.
- Remove raw debug logs in Expo app code.
- Add lint or script guidance to catch new raw colors and hardcoded typography where practical.
- Document primitive usage in a short design-system note.

Deliverable:

- Future UI work has a clear standard.

## File-Level TODO Checklist

### Theme and UI

- [ ] `apps/expo/theme.ts`: add semantic color tokens.
- [ ] `apps/expo/theme.ts`: add typography roles.
- [ ] `apps/expo/theme.ts`: add layout/control tokens.
- [ ] `apps/expo/components/ui/Button.tsx`: make this the authoritative button.
- [ ] `apps/expo/components/ui/Button.tsx`: support icons, loading, variants, sizes, full width, truncation.
- [ ] `apps/expo/components/ui/IconButton.tsx`: create shared icon button.
- [ ] `apps/expo/components/ui/Card.tsx`: consolidate with Surface.
- [ ] `apps/expo/components/ui/app-primitives.tsx`: remove hardcoded colors/sizes where possible.
- [ ] `apps/expo/components/ui/Input.tsx`: evolve into TextField.
- [ ] `apps/expo/components/ui/PageLayout.tsx`: remove hardcoded horizontal padding.
- [ ] `apps/expo/components/ui/CustomPageHeader.tsx`: align with PageHeader or consolidate.
- [ ] Add shared `ButtonGroup` or responsive action row helper.
- [ ] Add shared empty/loading/error state components.

### Home

- [ ] `apps/expo/app/(app)/home.tsx`: migrate workout card styles to semantic tokens.
- [ ] `apps/expo/app/(app)/home.tsx`: use responsive action layout.
- [ ] `apps/expo/app/(app)/home.tsx`: prevent button label wrapping.
- [ ] `apps/expo/app/(app)/home.tsx`: standardize Quick Access card interaction.
- [ ] `apps/expo/app/(app)/home.tsx`: standardize metric/recovery layout.

### Workouts

- [ ] `apps/expo/app/(app)/workouts.tsx`: migrate quick start buttons.
- [ ] `apps/expo/app/(app)/workouts.tsx`: migrate active program cards.
- [ ] `apps/expo/app/(app)/workouts.tsx`: stack secondary program actions on compact widths.
- [ ] `apps/expo/app/(app)/workouts.tsx`: migrate Start Workout modal to shared components.
- [ ] `apps/expo/components/workout/WorkoutCard.tsx`: migrate card and metric styling.

### Active Workout

- [ ] `apps/expo/app/workout-session.tsx`: replace raw header buttons with shared Button.
- [ ] `apps/expo/app/workout-session.tsx`: remove fixed `170 + insets.top` padding dependency.
- [ ] `apps/expo/app/workout-session.tsx`: remove debug logs from render path.
- [ ] `apps/expo/components/workout/ExerciseLogger.tsx`: remove debug logs.
- [ ] `apps/expo/components/workout/ExerciseLogger.tsx`: replace text arrows with icons.
- [ ] `apps/expo/components/workout/ExerciseLogger.tsx`: use shared Surface and Badge.
- [ ] `apps/expo/components/workout/SetLogger.tsx`: redesign Weight/Reps layout.
- [ ] `apps/expo/components/workout/SetLogger.tsx`: make value controls consume available width.
- [ ] `apps/expo/components/workout/SetLogger.tsx`: replace glyphs with icons.

### Templates

- [ ] `apps/expo/components/template/TemplateList.tsx`: migrate buttons/cards/icons.
- [ ] `apps/expo/components/template/TemplateEditor.tsx`: migrate header, fields, actions.
- [ ] `apps/expo/components/template/TemplateExerciseRow.tsx`: migrate row controls.
- [ ] `apps/expo/components/template/ExercisePicker.tsx`: migrate chips, buttons, and fields.
- [ ] `apps/expo/components/template/TemplateEditor/index.tsx`: determine whether duplicate is used; migrate or remove.

### Programs

- [ ] `apps/expo/app/(app)/programs.tsx`: migrate cards, buttons, chips.
- [ ] `apps/expo/app/(app)/programs.tsx`: migrate start program modal.
- [ ] `apps/expo/app/program-schedule.tsx`: migrate schedule cards and action rows.
- [ ] `apps/expo/app/program-schedule.tsx`: migrate reschedule modal chips/actions.
- [ ] `apps/expo/app/program-1rm-test.tsx`: migrate fields/buttons/cards.

### Nutrition

- [ ] `apps/expo/app/(app)/nutrition.tsx`: migrate quick prompts to responsive button group.
- [ ] `apps/expo/components/nutrition/NutritionDashboard.tsx`: tokenized surfaces and chart colors.
- [ ] `apps/expo/components/nutrition/ChatMessage.tsx`: tokenized message and analysis cards.
- [ ] `apps/expo/components/nutrition/ChatInput.tsx`: align button/input primitives.
- [ ] `apps/expo/components/nutrition/SaveMealDialog.tsx`: migrate modal controls.

### Profile and WHOOP

- [ ] `apps/expo/app/(app)/profile.tsx`: migrate cards/buttons/rows.
- [ ] `apps/expo/app/(app)/profile.tsx`: replace text chevrons with icons.
- [ ] `apps/expo/app/(app)/profile.tsx`: tokenized WHOOP brand color.
- [ ] `apps/expo/app/(app)/whoop.tsx`: migrate Card to consolidated Surface.
- [ ] `apps/expo/app/(app)/whoop.tsx`: tokenized chart colors.

### Auth

- [ ] `apps/expo/components/auth-shell.tsx`: move inline styles to primitives or StyleSheet.
- [ ] `apps/expo/app/auth/sign-in.tsx`: migrate fields/buttons/error state.
- [ ] `apps/expo/app/auth/sign-up.tsx`: migrate fields/buttons/error state.

## Verification Plan

Run after each phase:

```bash
bun run check
```

Run app-level validation:

```bash
bun run dev:expo
```

Manual visual QA:

- Home at 320, 360, 393, 430px.
- Workouts templates tab at 320, 360, 393, 430px.
- Workouts history tab at 320, 360, 393, 430px.
- Active Workout with several exercises and sets at 320, 360, 393, 430px.
- Active Workout with keyboard open while editing weight and reps.
- Programs list and start modal at 320, 360, 393, 430px.
- Program Schedule with several actions at 320, 360, 393, 430px.
- Nutrition assistant quick prompts at 320, 360, 393, 430px.
- Profile settings rows at 320, 360, 393, 430px.

Pass criteria:

- No action button text wraps.
- No label/value overlaps.
- No clipped button text unless intentionally ellipsized.
- No unexpected horizontal scrolling.
- No card content touches card borders.
- No text sits too high or too low within buttons or chips.
- Weight/Reps controls in Active Workout visibly use the card width.

## Risks

- Migrating all primitives at once could create large diffs and regressions.
- Changing button behavior globally may affect modals and nested pressables.
- Active Workout keyboard handling is sensitive and should be tested carefully.
- Some chart/WHOOP colors carry domain meaning and should be tokenized, not simply replaced.
- Duplicate TemplateEditor paths need investigation before deletion.

## Recommended First PR

Scope:

- Theme semantic tokens.
- Authoritative `Button`.
- `IconButton`.
- Consolidated `Surface`.
- Responsive action row helper.
- Home button wrapping fix.
- Workouts quick start and active program action wrapping fix.
- Active Workout SetLogger redesign.

Why:

- It addresses the visible pain points first.
- It creates reusable patterns for the rest of the migration.
- It avoids touching every screen before the primitives are proven.
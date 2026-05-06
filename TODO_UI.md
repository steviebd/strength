# UI/UX Consistency Handoff

> Status: Verified against the current Expo app on 2026-05-06.
> Goal: Give the next implementer a focused, code-grounded plan for consistent keyboard behavior, form inputs, spacing, and theme token usage.

## Summary

The original findings were mostly correct: keyboard handling is inconsistent, several form screens use raw `TextInput` styles, and hardcoded colors/spacing still bypass `theme.ts`.

Important corrections:

- `workout-session.tsx` is worse than the old note said: it currently uses `PageLayout` with `bottomInset: 400`, so it can create the same large dead space as the program start modal.
- `program-1rm-test.tsx` already uses many theme tokens, but it still has no keyboard avoidance, no auto-scroll, raw `TextInput`, no input chaining, and no narrow-width stacking.
- `PageLayout.tsx` and `Screen.tsx` are separate files. `PageLayout.tsx` still hardcodes `bottomInset={120}` and `horizontalPadding={20}`.
- `profile.tsx` bodyweight appears to be fine, but profile still has hardcoded visual styles such as `fontSize: 24`, `padding: 20`, `paddingVertical: 12`, and `rgba(...)` surfaces. Re-check the current nutrition target inputs before changing them because the old TODO may not describe that section exactly.
- `nutrition.tsx` is a chat/dashboard screen, not a generic form. Keep its chat-specific auto-scroll behavior unless replacing it with an equivalent that scrolls to the latest chat input on keyboard show.

## Verified Findings

### Keyboard And Scrolling

`apps/expo/context/ScrollContext.tsx`

- Uses fixed `KEYBOARD_HEIGHT = 300` and `TOP_OFFSET = 100`.
- Uses `measure(...)` with page coordinates instead of measuring relative to the scroll content.
- `useScrollToInput()` already returns a no-op outside a provider, which is good.

`apps/expo/app/(app)/programs.tsx`

- Imports and uses `KeyboardAvoidingView`.
- Program start modal has `paddingBottom: insets.bottom + 400`.
- Uses `scrollToInputByKey()` with custom layout tracking and `TextInput` focus handlers.
- Start modal is large inline JSX inside the screen and should be extracted.

`apps/expo/app/(app)/(program-detail)/program-1rm-test.tsx`

- Uses `PageLayout` for a keyboard-heavy form.
- Has raw 1RM `TextInput` fields.
- No `KeyboardAvoidingView`, no `ScrollProvider`, no input focus scrolling, and no input chaining.
- Starting/Tested cells are always `flexDirection: 'row'`.

`apps/expo/app/(app)/(workout-detail)/workout-session.tsx`

- Uses inline `KeyboardAvoidingView` with iOS-only `padding`.
- Uses `ScrollProvider` manually.
- Uses `PageLayout` with `bottomInset: 400`.
- This should move to the same form layout abstraction as the other keyboard-heavy screens.

`apps/expo/components/auth-shell.tsx`

- Uses inline `KeyboardAvoidingView`.
- Android uses `behavior="height"`.
- Exposes imperative `scrollToInput(y)` and auth screens manually call it from input `onFocus`.

`apps/expo/app/(app)/nutrition.tsx`

- Uses inline `KeyboardAvoidingView` with `behavior="height"` on Android.
- Uses a `Keyboard.addListener('keyboardDidShow')` listener to scroll to chat input. This behavior is intentional and chat-specific.

`apps/expo/components/workout/ExerciseSearch.tsx`

- Create form uses inline `KeyboardAvoidingView`.
- `keyboardVerticalOffset={insets.top}` is likely wrong because the offset should represent the modal/header height, not just the status bar inset.
- Uses a large create-form bottom padding: `insets.bottom + spacing.xxl * 4`.

### Theme And Component Consistency

`apps/expo/theme.ts`

- Already has useful `surface`, `border`, `text`, `accent`, `spacing`, `radius`, `typography`, `textRoles`, and `layout` tokens.
- Missing shared overlay/status tokens for repeated translucent backgrounds and borders.

`apps/expo/components/ui/app-primitives.tsx`

- Still has hardcoded `rgba(...)` values in surface tones, badges, buttons, metric tiles, and segmented tabs.
- Still has `borderRadius: 9999`, `fontSize: 12`, `paddingVertical: 14`, `paddingHorizontal: 16`, and active text `'#0a0a0a'`.

`apps/expo/components/ui/Button.tsx`

- Mostly tokenized, but still has hardcoded secondary/danger colors and pressed rgba values. Lower priority than the app-level form problems.

`apps/expo/components/ui/Input.tsx`

- The themed `TextField` exists and is used in several places.
- It does not currently call `useScrollToInput()` on focus.

`apps/expo/app/(app)/programs.tsx`

- `getDifficultyColor()` returns literal hex colors.
- Delete button and offline error banners use inline `rgba(...)`.
- Start modal 1RM inputs are raw `TextInput` with a prominent `fontSize: 24` style.

`apps/expo/components/workout/ExerciseSearch.tsx`

- Several accent/error rgba values are hardcoded. These can move to tokens, but keep accent-specific interaction states visually equivalent.

## Implementation Plan

Do this in phases. Keep each phase small enough to validate on device.

### 1. Add Shared Form Infrastructure

Add `apps/expo/components/ui/KeyboardFormLayout.tsx`.

- iOS: wrap children in `KeyboardAvoidingView` with `behavior="padding"`.
- Android and web: return a plain `View`.
- Use `colors.background`.
- Accept `keyboardVerticalOffset?: number` and `style?: ViewStyle`.

Add `apps/expo/components/ui/FormScrollView.tsx`.

- Wrap the scroll view in `ScrollProvider`.
- Use `paddingHorizontal: layout.screenPadding`.
- Default bottom padding should be small: `insets.bottom + spacing.md`.
- Set `keyboardShouldPersistTaps="handled"`.
- Set `keyboardDismissMode="interactive"` on iOS only if Android behavior is poor.
- Forward refs safely.

Update `apps/expo/context/ScrollContext.tsx`.

- Replace fixed keyboard constants with `measureLayout(...)` relative to `scrollViewRef.current.getInnerViewNode()`.
- Support `scrollToInput(inputRef, offset = 80)`.
- Keep the no-op fallback when outside a provider.
- Add a short delayed fallback if `measureLayout` fails on first focus.

Update `apps/expo/components/ui/Input.tsx`.

- Call `useScrollToInput()` from `onFocus`.
- Preserve caller `onFocus` behavior.
- Do not make `TextField` require a `ScrollProvider`; the existing no-op fallback should keep normal screens safe.

Add `apps/expo/components/ui/MetricInput.tsx`.

- Use for large numeric values such as 1RMs, set weights, reps where appropriate.
- Use `textRoles.metricValue` or a dedicated token rather than literal `24`.
- Include focus border state using `border.focus`.
- Auto-scroll via `useScrollToInput()`.
- Consider an iOS `InputAccessoryView` with a Done button for `decimal-pad`.

### 2. Add Missing Theme Tokens

Update `apps/expo/theme.ts` with shared translucent tokens. Prefer extending existing objects instead of creating parallel concepts.

Recommended additions:

```ts
export const overlay = {
  subtle: 'rgba(255,255,255,0.05)',
  muted: 'rgba(255,255,255,0.08)',
  medium: 'rgba(255,255,255,0.1)',
  inverseSubtle: 'rgba(0,0,0,0.2)',
};

export const statusBg = {
  success: 'rgba(34,197,94,0.12)',
  successBorder: 'rgba(34,197,94,0.3)',
  warning: 'rgba(245,158,11,0.12)',
  warningBorder: 'rgba(245,158,11,0.3)',
  error: 'rgba(239,68,68,0.12)',
  errorBorder: 'rgba(239,68,68,0.3)',
  dangerStrong: 'rgba(244,63,94,0.2)',
  dangerSubtle: 'rgba(244,63,94,0.1)',
};
```

Also consider adding:

```ts
layout.bottomInsetList = 120;
layout.bottomInsetForm = spacing.md;
```

Do not tokenize one-off domain colors blindly. WHOOP charts, brand colors, or chart palettes can remain local if they represent domain data rather than app chrome.

### 3. Fix Highest-Impact Screens

`apps/expo/app/(app)/(program-detail)/program-1rm-test.tsx`

- Replace `PageLayout` with `KeyboardFormLayout` and `FormScrollView`.
- Keep `CustomPageHeader`.
- Replace raw 1RM `TextInput` with `MetricInput`.
- Add refs and `returnKeyType`/`onSubmitEditing` input chaining.
- Add `useWindowDimensions()` and stack Starting/Tested cells below roughly `380px`.
- Replace `${colors.accent}15` with a token such as `accent.subtle`.

`apps/expo/app/(app)/programs.tsx`

- Extract the start modal to `apps/expo/components/program/ProgramStartModal.tsx`.
- Use `KeyboardFormLayout` and `FormScrollView` inside the modal.
- Remove `paddingBottom: insets.bottom + 400`.
- Remove `scrollToInputByKey()`, input layout tracking, and fixed keyboard height math.
- Replace start modal raw 1RM inputs with `MetricInput`.
- Keep schedule-section scrolling, but measure relative to the scroll content rather than using page coordinate math.
- Replace `getDifficultyColor()` literal hex values with `colors`, `statusBg`, or badge tone tokens.
- Replace inline offline/delete rgba styles with tokens.

`apps/expo/app/(app)/(workout-detail)/workout-session.tsx`

- Replace inline `KeyboardAvoidingView` with `KeyboardFormLayout`.
- Replace the manual `ScrollProvider` + `PageLayout` scroll composition with `FormScrollView` if practical.
- Remove `bottomInset: 400`; use a form-appropriate bottom inset plus any real fixed footer/header allowance.
- Preserve existing workout set auto-scroll behavior and test it carefully. This screen has more custom scroll logic than the others.

### 4. Normalize Secondary Keyboard Screens

`apps/expo/components/auth-shell.tsx`

- Replace inline `KeyboardAvoidingView` with `KeyboardFormLayout`.
- Use `FormScrollView` if it can preserve the current centered card layout.
- After `TextField` auto-scroll is in place, remove manual `scrollToInput()` calls from `sign-in.tsx` and `sign-up.tsx`.
- Keep the imperative handle temporarily only if a custom auth input still needs it.

`apps/expo/components/workout/ExerciseSearch.tsx`

- Replace the create-form `KeyboardAvoidingView` with `KeyboardFormLayout`.
- Use `FormScrollView` for the create form.
- Replace `keyboardVerticalOffset={insets.top}` with the actual modal header height or `0` if the header is inside the avoider.
- Reduce large bottom padding unless testing proves it is needed.

`apps/expo/app/(app)/nutrition.tsx`

- Do not treat this exactly like a form screen.
- Either keep the current chat-specific keyboard listener or move it into `ChatInput.tsx` with equivalent behavior.
- If keeping a keyboard wrapper, use `KeyboardFormLayout`; otherwise rely on `PageLayout` and sufficient bottom padding for the embedded chat input.

`apps/expo/app/(app)/profile.tsx`

- Replace hardcoded card/input styles with `layout`, `spacing`, `textRoles`, `overlay`, and `border`.
- Re-check current nutrition target editing before replacing inputs; choose `TextField` for normal text/numeric inputs and `MetricInput` only where a large metric value is desired.

### 5. Clean Shared UI Primitives

`apps/expo/components/ui/PageLayout.tsx`

- Replace `horizontalPadding={20}` with `horizontalPadding={layout.screenPadding}`.
- Replace `bottomInset={120}` with a layout token if added.
- Keep `PageLayout` for read-only/list/dashboard screens, not dense keyboard forms.

`apps/expo/components/ui/app-primitives.tsx`

- Replace repeated rgba values with `overlay`, `statusBg`, `surface`, `border`, and `accent` tokens.
- Replace `borderRadius: 9999` with `radius.full`.
- Replace `fontSize: 12` with an existing typography/text role token.
- Replace hardcoded paddings with `spacing`/`layout` tokens.
- Replace active inverse text `'#0a0a0a'` with `text.inverse`.

## Testing Checklist

Keyboard/device checks:

- `program-1rm-test.tsx`: on a small iPhone width, tap Squat, Bench, Deadlift, OHP. The focused field must be visible and rows should stack only on narrow screens.
- `program-1rm-test.tsx`: input chaining moves through fields; last input can dismiss the keyboard.
- `programs.tsx` start modal: entering all 1RMs should not create a huge blank area above the keyboard.
- `programs.tsx` start modal: moving from 1RM to schedule still scrolls to the schedule section.
- `workout-session.tsx`: weight/reps inputs stay visible on iOS and Android, and dismissing the keyboard does not leave a large blank gap.
- `auth/sign-in.tsx` and `auth/sign-up.tsx`: focusing email/password fields scrolls enough without manual page-coordinate math.
- `ExerciseSearch.tsx`: create custom exercise form keeps name/description visible while typing.
- `nutrition.tsx`: focusing the chat input still scrolls the assistant area to the active conversation/input.

Visual checks:

- Start modal, 1RM results, workout session, auth, and exercise search use consistent input heights, border radii, focus borders, and bottom spacing.
- No modified file keeps avoidable hardcoded `rgba(...)` values for app chrome.
- No modified file keeps avoidable literal `padding: 16`, `paddingHorizontal: 16`, `paddingVertical: 12`, or metric `fontSize: 24` where a theme token exists.
- Narrow screens do not truncate button text or force rows to overflow.

Validation:

```bash
bun run check
bun run test
```

Manual Android testing is required for this work because the intended strategy relies on native resize behavior instead of Android `KeyboardAvoidingView`.

## Risks

- Android modals may not always resize as expected. If `ProgramStartModal` still covers fields, add a targeted fallback scroll-on-focus rather than reintroducing large bottom padding.
- `measureLayout()` can fail before layout is ready. Keep a delayed retry inside `ScrollContext`.
- `workout-session.tsx` has separate set-navigation scroll logic. Preserve that behavior while removing keyboard-specific dead space.
- iOS `decimal-pad` may not expose a Done key. Add an `InputAccessoryView` in `MetricInput` if users cannot dismiss the keyboard naturally.

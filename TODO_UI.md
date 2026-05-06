# UI/UX & Keyboard Refactor — Plan / PDR

> **Status:** Ready for implementation  
> **Goal:** Fix keyboard behavior inconsistencies, standardize theme usage, and improve mobile responsiveness across the Expo app.  
> **Approach:** Hybrid (KAV on iOS + native resize on Android + manual scroll-to-input as safety net), fully DRY.

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Theme Token Additions](#3-theme-token-additions)
4. [New Components & Hooks](#4-new-components--hooks)
5. [Screen-by-Screen Changes](#5-screen-by-screen-changes)
6. [Files to Modify](#6-files-to-modify)
7. [Testing Checklist](#7-testing-checklist)
8. [Risks & Gotchas](#8-risks--gotchas)

---

## 1. Problem Statement

### 1.1 Keyboard Behavior Is Broken and Inconsistent

| Screen | KAV? | Behavior | Bottom Padding | Manual Scroll | Issue |
|--------|------|----------|---------------|---------------|-------|
| `programs.tsx` start modal | Yes | `padding` (iOS), `undefined` (Android) | `insets.bottom + 400` | `measure()` + hardcoded `KEYBOARD_HEIGHT = 300` | 400px padding + KAV = dead space. Android gets no avoidance. |
| `program-1rm-test.tsx` | **No** | N/A | None | None | Keyboard completely covers bottom inputs (OHP). |
| `workout-session.tsx` | Yes | `padding` (iOS), `undefined` (Android) | KAV handles it | `ScrollContext` + `useScrollToInput()` | Android broken. Manual scroll works but is duplicated. |
| `auth-shell.tsx` | Yes | `padding`/`height` | `88` / `0` offset | `measure()` + `scrollToInput()` | Reasonable but not reusable. |
| `nutrition.tsx` | Yes | `padding`/`height` | Small | `Keyboard.addListener('keyboardDidShow')` + custom math | One-off, works but not DRY. |
| `ExerciseSearch.tsx` | Yes | `padding`/`height` | `insets.top` offset | None | Offset is `insets.top` (weird for a header). |

**Root causes:**
- Every screen reimplements keyboard handling.
- `KeyboardAvoidingView` + large `bottomInset` (120px, 400px) creates visible dead space above the keyboard.
- Android `behavior="height"` inside `ScrollView` is unreliable (doesn't always restore layout on dismiss).
- `program-1rm-test.tsx` has zero keyboard handling.

### 1.2 Theme Tokens Are Ignored

The app has a well-designed `theme.ts` with `colors`, `spacing`, `radius`, `typography`, `textRoles`, `layout`, `surface`, `border`, and `accent` tokens. But:

- **Hardcoded `fontSize` values** appear in ~20+ places (`fontSize: 14`, `16`, `20`, `24`, `48`).
- **Hardcoded `padding` values** (`padding: 16`, `paddingVertical: 12`, `paddingHorizontal: 16`) appear in ~30+ places.
- **Hardcoded `rgba(...)` colors** for subtle backgrounds/borders appear in ~40+ places.
- **Literal hex strings** in `getDifficultyColor()` instead of `colors.success`/`warning`/`error`.
- `app-primitives.tsx` has its own violations (`fontSize: 12`, `borderRadius: 9999`, `rgba(0,0,0,0.2)`).

### 1.3 Input Component Inconsistency

- **Standard `TextField`** (in `components/ui/Input.tsx`) — used in auth, profile bodyweight, nutrition targets. Height 48px, themed.
- **Raw `TextInput`** — used in programs 1RM, program-1rm-test, SetLogger, ChatInput, ExerciseSearch. Each has custom inline styles.
- Programs 1RM inputs use `fontSize: 24` bold with `backgroundColor: colors.background` — visually distinct but not a component.

### 1.4 Mobile Responsiveness Gaps

- Only 3 screens have width breakpoints: `workout-session.tsx`, `workouts.tsx`, `SetLogger.tsx`.
- `program-1rm-test.tsx` uses `flexDirection: 'row'` for Starting/Tested columns with no narrow-screen fallback.
- `programs.tsx` start modal has no responsive adjustments.

---

## 2. Architecture Decisions

### 2.1 Use a Hybrid Keyboard Strategy (Not KAV-Only)

We were burnt by `KeyboardAvoidingView` in the past. Here's what actually works in 2025:

| Platform | Strategy | Rationale |
|----------|----------|-----------|
| **iOS** | `KeyboardAvoidingView` with `behavior="padding"` | Very reliable on iOS. View padding expands, content pushes up naturally. |
| **Android** | **Skip KAV**. Rely on native `windowSoftInputMode="adjustResize"` | `behavior="height"` inside ScrollView is buggy — doesn't always restore layout on dismiss. Expo sets `adjustResize` by default. |
| **Web** | Plain `View`. Browser handles viewport natively. | `KeyboardAvoidingView` is a no-op on web anyway. |

**Safety net:** On all platforms, use `measure()` + `scrollTo()` on input focus to scroll the focused input into view with a small margin. This is the existing pattern in auth, programs, and nutrition — we just make it DRY.

### 2.2 Separate Layout Patterns

| Pattern | Use For | Bottom Padding | KAV? |
|---------|---------|---------------|------|
| **`PageLayout`** | Read-only/list screens (home, programs list, workouts list, nutrition dashboard, profile) | `insets.bottom + 120` | No |
| **`KeyboardFormLayout`** | Keyboard-heavy form screens (program start modal, 1RM test, workout session, search create form) | `insets.bottom + spacing.md` (~16-24px) | Yes (iOS only) |

**Why:** Prevents dead space. Form layouts don't pre-reserve 120px of scrollable padding. The KAV (iOS) or native resize (Android) handles keyboard space.

### 2.3 Auto-Scroll on Focus

Every form input should auto-scroll itself into view when focused. This is handled by:
- `ScrollContext` (already partially exists) — provides `scrollToInput(ref)`.
- `MetricInput` and `TextField` — call `scrollToInput` on `onFocus` automatically.
- No more manual `onFocus={() => scrollToInputByKey(key)}` in every screen.

### 2.4 Token-First Styling

Every component and screen must use theme tokens. Hardcoded values are only allowed for:
- One-off visual effects (gradients, shadows) not covered by tokens.
- Platform-specific constants (e.g., `keyboardVerticalOffset` which depends on header height).

---

## 3. Theme Token Additions

**File:** `apps/expo/theme.ts`

Add these new tokens for the hardcoded `rgba` colors currently scattered across the app:

```typescript
// Subtle overlay backgrounds (replacing hardcoded rgba(255,255,255,0.05) etc.)
export const overlay = {
  subtle: 'rgba(255,255,255,0.05)',
  muted: 'rgba(255,255,255,0.08)',
  medium: 'rgba(255,255,255,0.1)',
};

// Status/semantic backgrounds (replacing inline error/warning/success banners)
export const statusBg = {
  success: 'rgba(34,197,94,0.12)',
  successBorder: 'rgba(34,197,94,0.3)',
  warning: 'rgba(245,158,11,0.12)',
  warningBorder: 'rgba(245,158,11,0.3)',
  error: 'rgba(239,68,68,0.12)',
  errorBorder: 'rgba(239,68,68,0.2)',
  errorStrong: 'rgba(244,63,94,0.2)', // for delete/danger buttons
  errorStrongBg: 'rgba(244,63,94,0.1)',
};
```

**Note:** Do not add tokens for one-off app-specific colors (e.g., `whoop.tsx` sleep bar colors `#9333ea`, `#3b82f6`). Those are domain-specific and okay as literals.

---

## 4. New Components & Hooks

### 4.1 `KeyboardFormLayout`

**New file:** `apps/expo/components/ui/KeyboardFormLayout.tsx`

Platform-smart wrapper for form screens. Replaces ad-hoc `KeyboardAvoidingView` usage.

```tsx
import { KeyboardAvoidingView, Platform, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '@/theme';

interface KeyboardFormLayoutProps {
  children: React.ReactNode;
  keyboardVerticalOffset?: number; // iOS only. Default: 0
  style?: ViewStyle;
}

export function KeyboardFormLayout({
  children,
  keyboardVerticalOffset = 0,
  style,
}: KeyboardFormLayoutProps) {
  const insets = useSafeAreaInsets();

  // On Android and web, KAV is not needed / not reliable.
  // Android: native windowSoftInputMode="adjustResize" handles it.
  // Web: browser handles viewport naturally.
  if (Platform.OS !== 'ios') {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }, style]}>
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[{ flex: 1, backgroundColor: colors.background }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
```

**Usage:**
```tsx
<KeyboardFormLayout keyboardVerticalOffset={headerHeight}>
  <FormScrollView>
    {/* form content */}
  </FormScrollView>
</KeyboardFormLayout>
```

### 4.2 `FormScrollView`

**New file:** `apps/expo/components/ui/FormScrollView.tsx`

ScrollView for form screens. Minimal bottom padding, provides `ScrollContext`.

```tsx
import React, { useRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '@/theme';
import { ScrollProvider } from '@/context/ScrollContext';

interface FormScrollViewProps extends ScrollViewProps {
  children: React.ReactNode;
}

export const FormScrollView = React.forwardRef<ScrollView, FormScrollViewProps>(
  ({ children, contentContainerStyle, ...props }, ref) => {
    const insets = useSafeAreaInsets();
    const scrollViewRef = useRef<ScrollView>(null);

    return (
      <ScrollProvider scrollViewRef={scrollViewRef}>
        <ScrollView
          ref={(r) => {
            scrollViewRef.current = r;
            if (typeof ref === 'function') ref(r);
            else if (ref) ref.current = r;
          }}
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={[
            {
              paddingHorizontal: layout.screenPadding,
              paddingBottom: insets.bottom + spacing.md,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          {...props}
        >
          {children}
        </ScrollView>
      </ScrollProvider>
    );
  }
);
FormScrollView.displayName = 'FormScrollView';
```

**Key differences from `ScreenScrollView`:**
- Bottom padding is `insets.bottom + spacing.md` (not 120).
- Wraps children in `ScrollProvider` so any child input can auto-scroll.
- Defaults `keyboardShouldPersistTaps="handled"` and `keyboardDismissMode="interactive"`.

### 4.3 `MetricInput`

**New file:** `apps/expo/components/ui/MetricInput.tsx`

Themed large numeric input for 1RMs, weight, reps. Keeps the prominent `fontSize: 24` visual but uses theme tokens everywhere else.

```tsx
import React, { forwardRef } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { colors, radius, spacing, typography, border } from '@/theme';
import { useScrollToInput } from '@/context/ScrollContext';

interface MetricInputProps extends Omit<TextInputProps, 'style'> {
  unit?: string; // displayed as placeholder suffix or right slot
}

export const MetricInput = forwardRef<TextInput, MetricInputProps>(
  ({ onFocus, unit, ...props }, ref) => {
    const scrollToInput = useScrollToInput();

    return (
      <TextInput
        ref={ref}
        style={{
          color: colors.text,
          fontSize: typography.fontSizes.xxl, // 28, or use a custom metric size
          fontWeight: typography.fontWeights.bold,
          backgroundColor: colors.background,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: border.default,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          minHeight: layout.controlHeight, // 48
        }}
        placeholderTextColor={colors.placeholderText}
        keyboardType="decimal-pad"
        returnKeyType="done"
        onFocus={(e) => {
          scrollToInput(ref as any);
          onFocus?.(e);
        }}
        {...props}
      />
    );
  }
);
MetricInput.displayName = 'MetricInput';
```

**Design notes:**
- `fontSize: typography.fontSizes.xxl` (28) is slightly larger than current 24. Adjust to taste, but keep it prominent.
- Border color changes to `border.focus` on focus (requires `useState` for focus state).
- Auto-calls `scrollToInput` on focus via `ScrollContext`.
- For iOS decimal-pad with no Done button, wrap in an `InputAccessoryView` or add a blur-on-submit behavior. See Gotchas.

### 4.4 Update `ScrollContext`

**File:** `apps/expo/context/ScrollContext.tsx`

Expand the existing context to support auto-scroll:

```tsx
import React, { createContext, useContext, useRef, useCallback } from 'react';
import { ScrollView, type TextInput, type LayoutRectangle } from 'react-native';

interface ScrollContextValue {
  scrollToInput: (inputRef: React.RefObject<TextInput | null>, offset?: number) => void;
}

const ScrollContext = createContext<ScrollContextValue | null>(null);

export function ScrollProvider({
  scrollViewRef,
  children,
}: {
  scrollViewRef: React.RefObject<ScrollView | null>;
  children: React.ReactNode;
}) {
  const scrollToInput = useCallback(
    (inputRef: React.RefObject<TextInput | null>, offset = 80) => {
      if (!inputRef.current || !scrollViewRef.current) return;

      inputRef.current.measureLayout(
        scrollViewRef.current.getInnerViewNode(),
        (x, y, width, height) => {
          const scrollY = Math.max(0, y - offset);
          scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
        },
        () => {
          // Fallback: do nothing if measure fails
        }
      );
    },
    [scrollViewRef]
  );

  return (
    <ScrollContext.Provider value={{ scrollToInput }}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScrollToInput() {
  const ctx = useContext(ScrollContext);
  if (!ctx) {
    // Return no-op if outside provider (e.g., in PageLayout screens)
    return () => {};
  }
  return ctx.scrollToInput;
}
```

**Key changes from existing:**
- `measureLayout` instead of `measure` — measures relative to the ScrollView's inner view, avoiding coordinate math.
- `offset` parameter for viewport margin (default 80px above the input).
- Returns a no-op if outside a `ScrollProvider` (safe for non-form screens).

---

## 5. Screen-by-Screen Changes

### 5.1 `program-1rm-test.tsx` (Most Critical)

**File:** `apps/expo/app/(app)/(program-detail)/program-1rm-test.tsx`

**Current state:**
- No `KeyboardAvoidingView`.
- Raw `TextInput` with inline styles.
- No scroll-to-input logic.
- `flexDirection: 'row'` Starting/Tested columns — cramped on narrow screens.

**Changes:**
1. **Wrap in `KeyboardFormLayout`**:
   ```tsx
   <KeyboardFormLayout keyboardVerticalOffset={headerHeight}>
     <CustomPageHeader ... />
     <FormScrollView>
       {/* content */}
     </FormScrollView>
   </KeyboardFormLayout>
   ```
   Note: `CustomPageHeader` sits **outside** `FormScrollView` so KAV offset accounts for its height.

2. **Replace `PageLayout` with the above wrapper.** `PageLayout` is for list screens; this is a form.

3. **Replace raw `TextInput` with `MetricInput`**:
   ```tsx
   <MetricInput
     value={testValStr}
     onChangeText={...}
     keyboardType="decimal-pad"
     returnKeyType={key === 'ohp' ? 'done' : 'next'}
     onSubmitEditing={() => focusNextInput(key)}
   />
   ```

4. **Add responsive stacking**:
   ```tsx
   const { width } = useWindowDimensions();
   const isNarrow = width < 380;
   
   <View style={[styles.row, isNarrow && styles.rowStacked]}>
   ```
   ```
   rowStacked: { flexDirection: 'column', gap: spacing.md }
   ```

5. **Replace all hardcoded styles with theme tokens**:
   - `padding: spacing.md`
   - `borderRadius: radius.xl`
   - `fontSize: typography.fontSizes.xl` (for cell values)
   - `backgroundColor: colors.surface`
   - `borderColor: colors.border`
   - Delete inline `rgba(...)` colors.

6. **Add input chaining**:
   - Store refs in `useRef<Record<string, TextInput>>({})`.
   - `focusNextInput(key)` finds next key in `LIFT_FIELDS` array and calls `.focus()`.

### 5.2 `programs.tsx` — Extract & Fix Start Modal

**File:** `apps/expo/app/(app)/programs.tsx` (modify)  
**New file:** `apps/expo/components/program/ProgramStartModal.tsx` (extract)

**Current state:**
- Start modal is ~600 lines of inline JSX inside `programs.tsx`.
- Uses `KeyboardAvoidingView` + `paddingBottom: insets.bottom + 400` hack.
- Uses `scrollToInputByKey()` with hardcoded `KEYBOARD_HEIGHT = 300`.
- Raw `TextInput` with `fontSize: 24` inline.
- `getDifficultyColor()` returns literal hex strings.
- Offline error banner uses inline `rgba(...)` styles.

**Changes to `programs.tsx`:**
1. **Extract the start modal into `ProgramStartModal.tsx`.**
   - Props: `visible`, `program`, `onClose`, `onStart`, `latestOneRMs`, `weightUnit`.
   - Keep state management (1RM values, schedule, review) inside the modal component.

2. **In `programs.tsx`, replace inline modal with:**
   ```tsx
   <ProgramStartModal
     visible={showStartModal}
     program={selectedProgram}
     latestOneRMs={latestOneRMs}
     weightUnit={weightUnit}
     onClose={() => setShowStartModal(false)}
     onStart={handleStartProgram}
   />
   ```

3. **Fix `getDifficultyColor()`:**
   ```ts
   function getDifficultyColor(difficulty: string) {
     switch (difficulty) {
       case 'beginner':
         return { bg: statusBg.success, text: colors.success };
       case 'intermediate':
         return { bg: statusBg.warning, text: colors.warning };
       case 'advanced':
         return { bg: statusBg.error, text: colors.error };
       default:
         return { bg: colors.surfaceAlt, text: colors.textMuted };
     }
   }
   ```

4. **Fix offline error banner** in active programs section:
   Replace inline:
   ```tsx
   style={{
     borderRadius: 12,
     borderWidth: 1,
     borderColor: 'rgba(239, 68, 68, 0.2)',
     backgroundColor: 'rgba(239, 68, 68, 0.1)',
     paddingHorizontal: 16,
     paddingVertical: 12,
   }}
   ```
   With:
   ```tsx
   style={{
     borderRadius: radius.lg,
     borderWidth: 1,
     borderColor: statusBg.errorBorder,
     backgroundColor: statusBg.error,
     paddingHorizontal: spacing.md,
     paddingVertical: spacing.sm,
   }}
   ```
   And `fontSize: typography.fontSizes.sm`.

**In `ProgramStartModal.tsx`:**
1. **Replace KAV + 400px hack with `KeyboardFormLayout` + `FormScrollView`:**
   ```tsx
   <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
     <KeyboardFormLayout keyboardVerticalOffset={insets.top + 60}>
       {/* Modal header */}
       <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
         ...
       </View>
       <FormScrollView>
         {/* 1RM inputs, schedule, review */}
       </FormScrollView>
     </KeyboardFormLayout>
   </Modal>
   ```

2. **Replace raw `TextInput` with `MetricInput`** for all 4 1RM fields.

3. **Remove `scrollToInputByKey()` and `inputCardLayouts` ref.** `MetricInput` auto-scrolls via `ScrollContext`.

4. **Remove `paddingBottom: insets.bottom + 400`.** `FormScrollView` provides `insets.bottom + spacing.md`.

5. **Keep `scrollToScheduleSection()`** (transition from 1RM step to schedule step). This is app logic, not keyboard handling. But simplify it:
   ```tsx
   const scrollToScheduleSection = useCallback(() => {
     scheduleSectionRef.current?.measureLayout(
       scrollViewRef.current?.getInnerViewNode(),
       (x, y) => {
         scrollViewRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: true });
       },
       () => {}
     );
   }, []);
   ```

### 5.3 `workout-session.tsx`

**File:** `apps/expo/app/(app)/(workout-detail)/workout-session.tsx`

**Current state:**
- Uses KAV with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`.
- `keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}`.
- Uses `ScrollContext` + `useScrollToInput()` already.

**Changes:**
1. **Replace inline KAV with `KeyboardFormLayout`:**
   ```tsx
   <KeyboardFormLayout keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
     {/* header */}
     <FormScrollView
       ref={scrollViewRef}
       contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
     >
       {/* workout content */}
     </FormScrollView>
   </KeyboardFormLayout>
   ```

2. **Ensure `ScrollProvider` is not duplicated.** `FormScrollView` already provides it. If `workout-session.tsx` wraps its own `ScrollProvider`, remove it.

3. **Change Android behavior from `undefined` to no KAV.** `KeyboardFormLayout` handles this.

### 5.4 `auth-shell.tsx`

**File:** `apps/expo/components/auth-shell.tsx`

**Current state:**
- Uses KAV with `padding`/`height` and `keyboardVerticalOffset={88}`.
- Has its own imperative `scrollToInput(y)` via `useImperativeHandle`.
- Auth screens call `scrollToInput` on every input focus.

**Changes:**
1. **Replace with `KeyboardFormLayout` + `FormScrollView`.**
   Keep the imperative handle for backwards compat if auth screens need it, but simplify:
   ```tsx
   <KeyboardFormLayout keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
     <FormScrollView ref={scrollViewRef}>
       {/* auth content */}
     </FormScrollView>
   </KeyboardFormLayout>
   ```

2. **Remove manual `scrollToInput` calls from auth screens** (`sign-in.tsx`, `sign-up.tsx`) if `MetricInput`/`TextField` auto-scroll works. If the auth `TextField` doesn't use `ScrollContext` yet, add it.

3. **Keep `keyboardShouldPersistTaps="handled"`** (already in `FormScrollView`).

### 5.5 `nutrition.tsx`

**File:** `apps/expo/app/(app)/nutrition.tsx`

**Current state:**
- Uses KAV with custom `keyboardAvoidingView` style.
- Has `Keyboard.addListener('keyboardDidShow')` that auto-scrolls to chat input.
- Custom `scrollToChatInput()` with `CHAT_FOCUS_HISTORY_OFFSET = 260`.

**Changes:**
1. **Evaluate if KAV is needed.** The chat interface has the input at the bottom. `ChatInput.tsx` already wraps itself in KAV. The main nutrition screen may not need KAV at all — just ensure the messages ScrollView has enough bottom padding.

2. **If KAV is removed**, replace with `PageLayout` (it's a chat/messaging screen, not a form).

3. **Keep `keyboardDidShow` listener** for auto-scrolling to bottom of chat. This is chat-specific behavior, not general keyboard handling.

4. **If keeping KAV**, wrap in `KeyboardFormLayout` instead of inline KAV.

### 5.6 `ExerciseSearch.tsx`

**File:** `apps/expo/components/workout/ExerciseSearch.tsx`

**Current state:**
- Uses KAV with `keyboardVerticalOffset={insets.top}`.
- Has `ScrollView` for search results and another for create form.

**Changes:**
1. **Replace with `KeyboardFormLayout`** for the create form section.
2. **Fix `keyboardVerticalOffset`.** `insets.top` is wrong — it should be the header height of the modal/screen, not the status bar inset.
3. **Use `FormScrollView` for the create form.**

### 5.7 `profile.tsx`

**File:** `apps/expo/app/(app)/profile.tsx`

**Current state:**
- Uses `PageLayout` (list screen).
- Has inline `TextInput` for bodyweight and nutrition targets with hardcoded styles.
- Nutrition target inputs use `fontSize: 16`, centered, height 40px.

**Changes:**
1. **Bodyweight input:** Already uses `Input` (`TextField`). Good.
2. **Nutrition target inputs:** Replace inline `TextInput` with `TextField` (standard) or `MetricInput` (if you want them prominent). At minimum:
   - Remove `fontSize: 16` → use `textRoles.input.fontSize` (15) or `typography.fontSizes.base`.
   - Remove hardcoded `paddingHorizontal: 16` → `spacing.md`.
   - Add `returnKeyType="next"` and chaining.
3. **Add `KeyboardFormLayout` around the editable section** or keep using `PageLayout` if inputs are sparse. If the nutrition targets section is the only editable part, you can wrap just that section in a `KeyboardFormLayout` inside the `PageLayout`, or add a small `FormScrollView` for that section.

### 5.8 `app-primitives.tsx`

**File:** `apps/expo/components/ui/app-primitives.tsx`

**Changes:**
1. `badgeLabel: { fontSize: 12 }` → `typography.fontSizes.xs` (11).
2. `backgroundColor: 'rgba(0,0,0,0.2)'` (metricTile) → `overlay.muted` or keep as a specific token if needed.
3. `backgroundColor: 'rgba(255,255,255,0.05)'` (segmentedTabs) → `overlay.subtle`.
4. `borderRadius: 9999` (badge) → `radius.full`.
5. `paddingVertical: 16`, `paddingHorizontal: 12` (metricTile) → `spacing.md` / `spacing.sm`.
6. `paddingVertical: 14`, `paddingHorizontal: 16` (actionButton) → `spacing.md`.
7. `color: '#0a0a0a'` (segmentTabLabelActive) → `colors.inverse`.

### 5.9 `PageLayout.tsx`

**File:** `apps/expo/components/ui/PageLayout.tsx`

**Changes:**
1. `horizontalPadding={20}` → `horizontalPadding={layout.screenPadding}`.
2. `bottomInset={120}` → Keep as 120 for list screens, but consider making it a theme token:
   ```ts
   // in theme.ts
   layout: {
     ...existing,
     bottomInsetList: 120,
     bottomInsetForm: 24, // or use spacing.md
   }
   ```
3. Ensure `PageLayout` does NOT wrap in `ScrollProvider` (only `FormScrollView` does).

---

## 6. Files to Modify

### New Files
| File | Purpose |
|------|---------|
| `apps/expo/components/ui/KeyboardFormLayout.tsx` | Platform-smart KAV wrapper |
| `apps/expo/components/ui/FormScrollView.tsx` | Form ScrollView with ScrollContext + minimal padding |
| `apps/expo/components/ui/MetricInput.tsx` | Themed large numeric input with auto-scroll |
| `apps/expo/components/program/ProgramStartModal.tsx` | Extracted start modal from programs.tsx |

### Modified Files
| File | Changes |
|------|---------|
| `apps/expo/theme.ts` | Add `overlay` and `statusBg` tokens |
| `apps/expo/context/ScrollContext.tsx` | Expand with `measureLayout`, `offset`, no-op fallback |
| `apps/expo/components/ui/Screen.tsx` | Consider adding `layout.bottomInsetList` token usage |
| `apps/expo/components/ui/PageLayout.tsx` | Use `layout.screenPadding`, keep `bottomInset: 120` |
| `apps/expo/components/ui/app-primitives.tsx` | Fix hardcoded fontSize, colors, paddings |
| `apps/expo/components/ui/Input.tsx` | Add `useScrollToInput` auto-scroll on focus |
| `apps/expo/app/(app)/programs.tsx` | Extract modal, fix difficulty colors, fix offline banner styles |
| `apps/expo/app/(app)/(program-detail)/program-1rm-test.tsx` | Add KAV wrapper, MetricInput, responsive stacking |
| `apps/expo/app/(app)/(workout-detail)/workout-session.tsx` | Replace inline KAV with KeyboardFormLayout |
| `apps/expo/components/auth-shell.tsx` | Replace inline KAV with KeyboardFormLayout + FormScrollView |
| `apps/expo/app/auth/sign-in.tsx` | Remove manual scrollToInput if auto-scroll works |
| `apps/expo/app/auth/sign-up.tsx` | Remove manual scrollToInput if auto-scroll works |
| `apps/expo/app/(app)/nutrition.tsx` | Evaluate KAV necessity, simplify if possible |
| `apps/expo/components/workout/ExerciseSearch.tsx` | Fix KAV offset, use FormScrollView for create form |
| `apps/expo/app/(app)/profile.tsx` | Fix nutrition target input styles, add input chaining |
| `apps/expo/app/(app)/workouts.tsx` | Fix inline error banner styles (if any hardcoded rgba) |
| `apps/expo/app/(app)/home.tsx` | Fix inline styles (if any) |

### Optional / Later
| File | Changes |
|------|---------|
| `apps/expo/components/workout/SetLogger.tsx` | Consider using `MetricInput` for weight/reps fields |
| `apps/expo/components/nutrition/ChatInput.tsx` | Evaluate if KAV is still needed |

---

## 7. Testing Checklist

### Keyboard Behavior
- [ ] `program-1rm-test.tsx`: Tap each 1RM input (Squat → Bench → Deadlift → OHP). Each should scroll into view. Keyboard should not cover OHP on iPhone SE / small Android.
- [ ] `program-1rm-test.tsx`: Tap "Done" on last input. Keyboard dismisses.
- [ ] `program-1rm-test.tsx`: Tap outside input. Keyboard dismisses (via `keyboardDismissMode="interactive"`).
- [ ] `programs.tsx` start modal: Enter 1RM values. No dead space above keyboard. Continue to Schedule button is visible.
- [ ] `programs.tsx` start modal: Tap Schedule step. Scrolls to schedule section smoothly.
- [ ] `workout-session.tsx`: Tap weight/reps inputs. Content pushes up. No jumping.
- [ ] `workout-session.tsx` on Android: Keyboard opens, content resizes. No KAV fighting.
- [ ] `auth/sign-in.tsx`: Tap email → password. Auto-scrolls. Submit works.
- [ ] Web: All form screens work without KAV. Browser scrolls inputs into view naturally.

### Theme Consistency
- [ ] No `fontSize: 14`, `16`, `20`, `24`, `48` literals remain in modified files.
- [ ] No `padding: 16`, `paddingVertical: 12`, `paddingHorizontal: 16` literals remain in modified files.
- [ ] No `rgba(...)` colors remain in modified files (except domain-specific like whoop charts).
- [ ] `getDifficultyColor()` uses `colors` and `statusBg` tokens.
- [ ] `app-primitives.tsx` uses `typography.fontSizes.xs` instead of `12`.

### Responsiveness
- [ ] `program-1rm-test.tsx` on iPhone SE (375px width): Starting/Tested columns stack vertically.
- [ ] `program-1rm-test.tsx` on iPhone 15 Pro (393px width): Columns stay side-by-side.
- [ ] `programs.tsx` start modal on narrow screen: No overflow, text wraps, chips reflow.

### Lint / Type Check
- [ ] `bun run check` passes with no errors.
- [ ] `bun run test` passes (no broken tests).

---

## 8. Risks & Gotchas

### 8.1 iOS Decimal-Pad Has No "Done" Button
The `decimal-pad` keyboard on iOS lacks a return/done key. Users can't dismiss it by tapping a key.

**Solutions (pick one):**
1. **Use `keyboardType="number-pad"`** for whole numbers (reps), `decimal-pad` only where decimals matter (weight, 1RM).
2. **Add `InputAccessoryView`** with a "Done" button above the keyboard. This is the iOS-native way:
   ```tsx
   import { InputAccessoryView } from 'react-native';
   
   <InputAccessoryView nativeID="doneButton">
     <Button title="Done" onPress={Keyboard.dismiss} />
   </InputAccessoryView>
   
   <TextInput inputAccessoryViewID="doneButton" ... />
   ```
3. **Use `returnKeyType="done"` + `blurOnSubmit`** — this works with `decimal-pad` on newer iOS versions but is inconsistent.

**Recommendation:** Implement `InputAccessoryView` in `MetricInput` as a wrapper. It's the most reliable UX.

### 8.2 Android `adjustResize` + Full-Screen Modals
Android `Modal` with `presentationStyle="fullScreen"` may not trigger `adjustResize` correctly on some devices. If the keyboard still covers inputs in the `ProgramStartModal` on Android:
- Add `android:windowSoftInputMode="adjustResize"` to `AndroidManifest.xml` (Expo handles this by default, but verify).
- Fallback: Keep a small manual `scrollToInput` on Android for modal screens specifically.

### 8.3 `measureLayout` Reliability
`measureLayout` can fail if:
- The input is not yet mounted.
- The ScrollView's inner view node is not ready.

**Mitigation:**
- Call `scrollToInput` in `onFocus` (guaranteed mounted).
- Add a `setTimeout(..., 100)` fallback in `ScrollContext.scrollToInput`.

### 8.4 Nested ScrollProviders
If `FormScrollView` provides `ScrollProvider`, and a parent also provides `ScrollProvider`, the inner one wins. Ensure no double-wrapping.

### 8.5 KAV + Tab Bar
`KeyboardFormLayout` is for screens/modals WITHOUT a tab bar. Screens with tab bars (like `nutrition.tsx`) should use `PageLayout` (no KAV) because the tab bar already has space. The KAV would push content above the tab bar, creating weird gaps.

### 8.6 Web Compatibility
`KeyboardAvoidingView` is a no-op on web. `FormScrollView` on web is just a `ScrollView`. Test that:
- Clicking an input on web scrolls it into view (browser handles this).
- The layout doesn't break on narrow desktop windows.

### 8.7 Existing `ScrollContext` Consumers
`workout-session.tsx` already uses `ScrollContext` via `ScrollProvider`. When replacing with `FormScrollView` (which has its own `ScrollProvider`), remove the outer `ScrollProvider` from `workout-session.tsx` to avoid nesting.

### 8.8 Safe Area Insets in Modals
Modals don't automatically get safe area insets on iOS. `ProgramStartModal` already handles this with `insets.top` for the header. Keep this — it's correct.

---

## Appendix: Existing Patterns Reference

### Current `ScrollContext` (`apps/expo/context/ScrollContext.tsx`)
Already provides `scrollToInput(inputRef)` using hardcoded `KEYBOARD_HEIGHT = 300`. Replace with the expanded version in Section 4.4.

### Current `auth-shell.tsx` Scroll
Uses `useImperativeHandle` to expose `scrollToInput(y)` to auth screens. Auth screens call it manually on every input `onFocus`. After refactor, `TextField` and `MetricInput` should auto-scroll, making manual calls unnecessary. But keep the imperative handle for backwards compat if any custom inputs still need it.

### Current `programs.tsx` Scroll
Uses `inputCardLayouts.current[key]` (from `LayoutChangeEvent`) + `measure()` fallback. Both use `KEYBOARD_HEIGHT = 300`. Replace entirely with `MetricInput`'s auto-scroll via `ScrollContext`.

### Current `nutrition.tsx` Scroll
Uses `Keyboard.addListener('keyboardDidShow')` to auto-scroll chat. This is chat-specific and should remain, but move the listener into `ChatInput.tsx` if possible.

---

*End of PDR. Ready for implementation.*

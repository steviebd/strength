import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActionSheetIOS,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { apiFetch } from '@/lib/api';
import {
  createLocalWorkoutFromCurrentProgramCycle,
  createLocalWorkoutFromProgramCycleWorkoutDefinition,
} from '@/db/workouts';
import { createLocalProgramCycleFromStartPayload } from '@/db/training-cache';
import { authClient } from '@/lib/auth-client';
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import { generateId } from '@strength/db/client';
import { enqueueSyncItem } from '@/db/sync-queue';
import { syncOfflineQueueAndCache } from '@/lib/workout-sync';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { useScrollToInput } from '@/context/ScrollContext';
import { PageLayout } from '@/components/ui/PageLayout';
import { FormScrollView } from '@/components/ui/FormScrollView';
import { KeyboardFormLayout } from '@/components/ui/KeyboardFormLayout';
import { PageHeader } from '@/components/ui/app-primitives';
import {
  useActivePrograms,
  useLatestOneRms,
  useProgramsCatalog,
  type ActiveProgram,
  type ProgramListItem,
} from '@/hooks/usePrograms';
import { usePullToRefresh, getPullToRefreshErrorMessage } from '@/hooks/usePullToRefresh';
import { ActionButton, Badge, SectionTitle, Surface } from '@/components/ui/app-primitives';
import {
  colors,
  spacing,
  radius,
  typography,
  layout,
  statusBg,
  border,
  surface,
  textRoles,
} from '@/theme';

const LBS_TO_KG = 0.453592;

type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type OneRmValues = { squat: string; bench: string; deadlift: string; ohp: string };
type StartMode = 'smart' | 'strict';
type PreferredTime = 'morning' | 'afternoon' | 'evening';

const PROGRAM_INFO: ProgramListItem[] = [
  {
    slug: 'stronglifts-5x5',
    name: 'StrongLifts 5×5',
    description:
      'The classic beginner program that has helped millions get stronger. Simple, effective, and proven.',
    difficulty: 'beginner',
    daysPerWeek: 3,
    estimatedWeeks: 12,
    totalSessions: 36,
  },
  {
    slug: '531',
    name: '5/3/1 (Wendler)',
    description:
      'The most popular strength program ever created. Flexible, sustainable, and proven to work.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 12,
    totalSessions: 48,
  },
  {
    slug: 'madcow-5x5',
    name: 'Madcow 5×5',
    description: 'Bridge from beginner to advanced. Built-in deloads and weekly weight increases.',
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 8,
    totalSessions: 24,
  },
  {
    slug: 'candito-6-week',
    name: 'Candito 6 Week',
    description:
      'Block periodization with 3-week strength block followed by 3-week peaking block. Great for meet preparation.',
    difficulty: 'advanced',
    daysPerWeek: 4,
    estimatedWeeks: 6,
    totalSessions: 24,
  },
  {
    slug: 'nsuns-lp',
    name: 'nSuns LP',
    description:
      'High volume linear progression. Excellent for building base strength with paired T1/T2 lifts.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'sheiko',
    name: 'Sheiko',
    description:
      'Russian-style high volume programming at moderate intensity. Excellent for technique work and building work capacity.',
    difficulty: 'advanced',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'nuckols-28-programs',
    name: 'Greg Nuckols 28 Programs',
    description:
      'Science-backed programming with 4-week wave periodization. Evidence-based progression for intermediate lifters.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'stronger-by-the-day',
    name: 'Stronger by the Day (Megsquats)',
    description:
      'A 12-week upper/lower split program designed specifically for women, featuring training max progression and glute-focused accessories.',
    difficulty: 'beginner',
    daysPerWeek: 3,
    estimatedWeeks: 12,
    totalSessions: 36,
  },
  {
    slug: 'unapologetically-strong',
    name: 'Unapologetically Strong (Jen Sinkler)',
    description:
      'An 8-week full body strength program designed to build a solid foundation of power and confidence.',
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 8,
    totalSessions: 24,
  },
];

function getDisplaySessionNumber(program: ActiveProgram) {
  return Math.min(program.totalSessionsCompleted + 1, program.totalSessionsPlanned);
}

function computeFirstSessionDate(startDate: Date, gymDays: DayOfWeek[], mode: StartMode): Date {
  const dayMap: Record<number, DayOfWeek> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  };

  if (mode === 'smart') {
    return startDate;
  }

  const startDayIndex = startDate.getDay();
  const startDayName = dayMap[startDayIndex];
  const startDayIdx = gymDays.indexOf(startDayName);

  if (startDayIdx === -1) {
    for (let i = 1; i <= 7; i++) {
      const checkDay = (startDayIndex + i) % 7;
      const checkDayName = dayMap[checkDay];
      if (gymDays.includes(checkDayName)) {
        const result = new Date(startDate);
        result.setDate(result.getDate() + i);
        return result;
      }
    }
  }

  return startDate;
}

function isFirstSelectedDay(dayName: DayOfWeek, gymDays: DayOfWeek[]): boolean {
  const dayOrder: Record<DayOfWeek, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const sorted = [...gymDays].sort((a, b) => dayOrder[a] - dayOrder[b]);
  return sorted[0] === dayName;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.md,
    lineHeight: textRoles.sectionTitle.lineHeight,
  },
  programsList: {
    gap: spacing.md,
  },
  programCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: layout.cardPadding,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    flex: 1,
    lineHeight: textRoles.cardTitle.lineHeight,
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
    marginTop: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  difficultyBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexShrink: 0,
  },
  difficultyText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'capitalize',
    lineHeight: textRoles.caption.lineHeight,
  },
  separator: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: textRoles.caption.lineHeight,
    flexShrink: 0,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: textRoles.caption.lineHeight,
    flexShrink: 0,
  },
  modalScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalScrollContent: {
    paddingBottom: 100,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: textRoles.sectionTitle.lineHeight,
  },
  modalContent: {
    paddingHorizontal: layout.screenPadding,
  },
  primaryButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: textRoles.button.lineHeight,
  },
  secondaryButton: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.button.lineHeight,
  },
  infoBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoBoxTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.xs,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  infoBoxText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  programNameTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.sm,
    lineHeight: textRoles.metricValue.lineHeight,
  },
  programDescriptionText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
    marginBottom: spacing.lg,
  },
  instructionsText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
    marginBottom: spacing.xl,
  },
  inputGroup: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  inputCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  inputLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputIcon: {
    fontSize: typography.fontSizes.xl,
  },
  inputLabel: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
  },
  inputUnit: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: textRoles.caption.lineHeight,
  },
  input: {
    minHeight: layout.controlHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: border.default,
    backgroundColor: surface.inset,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.text,
    fontSize: textRoles.metricValue.fontSize,
    lineHeight: textRoles.metricValue.lineHeight,
    fontWeight: textRoles.metricValue.fontWeight,
  },
  inputFocused: {
    borderColor: border.focus,
  },
  startButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  startButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    textAlign: 'center',
    lineHeight: textRoles.button.lineHeight,
  },
  dayChip: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipSelected: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  dayChipTextSelected: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  timeChip: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipSelected: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  timeChipTextSelected: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  scheduleCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  scheduleLabel: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.xs,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  scheduleHint: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: textRoles.caption.lineHeight,
    marginBottom: spacing.md,
  },
  dayChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timeChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  dateButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  startModeSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  startModeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  startModeTextContainer: {
    flex: 1,
  },
  startModeTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  startModeDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: textRoles.caption.lineHeight,
    marginTop: spacing.xs,
  },
  firstSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  scheduleButtons: {
    gap: spacing.md,
  },
  reviewProgramName: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.xs,
    lineHeight: textRoles.metricValue.lineHeight,
  },
  reviewMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
    marginBottom: spacing.lg,
  },
  reviewSection: {
    marginBottom: spacing.md,
  },
  reviewLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: textRoles.caption.lineHeight,
    marginBottom: spacing.xs,
  },
  reviewValue: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  reviewDaysRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  activeSection: {
    marginBottom: spacing.xl,
  },
  activeCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    padding: layout.cardPadding,
    gap: spacing.md,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeCardTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    lineHeight: textRoles.sectionTitle.lineHeight,
  },
  activeCardMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: textRoles.bodySmall.lineHeight,
    marginTop: spacing.xs,
  },
  activeCardButtons: {
    gap: spacing.md,
  },
  activeCardButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: statusBg.dangerStrong,
    backgroundColor: statusBg.dangerSubtle,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.error,
    lineHeight: textRoles.button.lineHeight,
  },
  offlineBanner: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: statusBg.errorBorder,
    backgroundColor: statusBg.error,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  offlineBannerText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  editInput: {
    flex: 1,
    color: colors.text,
    fontSize: textRoles.metricValue.fontSize,
    lineHeight: textRoles.metricValue.lineHeight,
    fontWeight: textRoles.metricValue.fontWeight,
    padding: 0,
  },
  inputText: {
    color: colors.text,
    fontSize: textRoles.metricValue.fontSize,
    lineHeight: textRoles.metricValue.lineHeight,
    fontWeight: textRoles.metricValue.fontWeight,
  },
  inputPlaceholder: {
    color: colors.textMuted,
    fontSize: textRoles.metricValue.fontSize,
    lineHeight: textRoles.metricValue.lineHeight,
    fontWeight: textRoles.metricValue.fontWeight,
  },
});

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

function OneRmInputFields({
  values,
  setOneRmValues,
  valuesRef,
  weightUnit,
}: {
  values: OneRmValues;
  setOneRmValues: (nextValues: OneRmValues) => void;
  valuesRef: React.MutableRefObject<OneRmValues>;
  weightUnit: string;
}) {
  const scrollToInput = useScrollToInput();
  const squatWrapperRef = useRef<View | null>(null);
  const benchWrapperRef = useRef<View | null>(null);
  const deadliftWrapperRef = useRef<View | null>(null);
  const ohpWrapperRef = useRef<View | null>(null);
  const wrapperRefs: Record<keyof OneRmValues, React.RefObject<View | null>> = {
    squat: squatWrapperRef,
    bench: benchWrapperRef,
    deadlift: deadliftWrapperRef,
    ohp: ohpWrapperRef,
  };
  const [editingKey, setEditingKey] = useState<keyof OneRmValues | null>(null);
  const [editValue, setEditValue] = useState('');
  const editingKeyRef = useRef<keyof OneRmValues | null>(null);
  editingKeyRef.current = editingKey;
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputOrder = ['squat', 'bench', 'deadlift', 'ohp'] as const;

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const handleEditStart = useCallback(
    (key: keyof OneRmValues) => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }

      if (editingKey === key) {
        setEditingKey(null);
        return;
      }

      if (editingKey) {
        const sanitized = editValue.replace(/[^0-9.]/g, '');
        setOneRmValues({ ...valuesRef.current, [editingKey]: sanitized });
      }

      setEditValue(valuesRef.current[key]);
      scrollToInput(wrapperRefs[key], 200);
      setEditingKey(key);
    },
    [editingKey, editValue, scrollToInput, setOneRmValues],
  );

  const handleEditEnd = useCallback(
    (key: keyof OneRmValues) => {
      if (editingKeyRef.current !== key) return;
      const sanitized = editValue.replace(/[^0-9.]/g, '');
      setOneRmValues({ ...valuesRef.current, [key]: sanitized });
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = setTimeout(() => {
        if (editingKeyRef.current === key) {
          setEditingKey(null);
        }
      }, 150);
    },
    [editValue],
  );

  const focusNextInput = (key: (typeof inputOrder)[number]) => {
    const currentIndex = inputOrder.indexOf(key);
    const nextKey = inputOrder[currentIndex + 1];

    handleEditEnd(key);

    if (nextKey) {
      handleEditStart(nextKey);
    }
  };

  return (
    <View style={styles.inputGroup}>
      {(
        [
          { key: 'squat', label: 'Squat 1RM', icon: '🏋️' },
          { key: 'bench', label: 'Bench Press 1RM', icon: '💪' },
          { key: 'deadlift', label: 'Deadlift 1RM', icon: '🦵' },
          { key: 'ohp', label: 'Overhead Press 1RM', icon: '🙆' },
        ] as const
      ).map(({ key, label, icon }) => (
        <View key={`program-1rm:${key}`} style={styles.inputCard}>
          <View style={styles.inputHeaderRow}>
            <View style={styles.inputLabelRow}>
              <Text style={styles.inputIcon}>{icon}</Text>
              <Text style={styles.inputLabel}>{label}</Text>
            </View>
            <Text style={styles.inputUnit}>{weightUnit}</Text>
          </View>
          <View ref={wrapperRefs[key]} collapsable={false}>
            <Pressable
              testID={`program-1rm-${key}`}
              accessibilityLabel={`program-1rm-${key}`}
              onPress={() => handleEditStart(key)}
              style={[styles.input, editingKey === key && styles.inputFocused]}
            >
              {editingKey === key ? (
                <TextInput
                  style={styles.editInput}
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  returnKeyType={key === 'ohp' ? 'done' : 'next'}
                  blurOnSubmit={key === 'ohp'}
                  onFocus={() => scrollToInput(wrapperRefs[key], 200)}
                  onBlur={() => handleEditEnd(key)}
                  onSubmitEditing={() => focusNextInput(key as (typeof inputOrder)[number])}
                />
              ) : (
                <Text style={values[key] ? styles.inputText : styles.inputPlaceholder}>
                  {values[key] || '0'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function ProgramsScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramListItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [startingProgram, setStartingProgram] = useState(false);
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const { isRefreshing, handleRefresh } = usePullToRefresh(userId);
  const [values, setValues] = useState<OneRmValues>({
    squat: '',
    bench: '',
    deadlift: '',
    ohp: '',
  });
  const [scheduleStep, setScheduleStep] = useState<'1rm' | 'schedule' | 'review'>('1rm');
  const [preferredGymDays, setPreferredGymDays] = useState<DayOfWeek[]>([]);
  const [preferredTime, setPreferredTime] = useState<PreferredTime>('morning');
  const [programStartDate, setProgramStartDate] = useState<Date>(new Date());
  const [startMode, setStartMode] = useState<StartMode>('smart');
  const [firstSessionDate, setFirstSessionDate] = useState<Date>(new Date());
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [showStartModeChoice, setShowStartModeChoice] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { activeTimezone, weightUnit } = useUserPreferences();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const detailScrollRef = useRef<ScrollView>(null);
  const modalContentY = useRef(0);
  const scheduleSectionY = useRef<number | null>(null);
  const valuesRef = useRef<OneRmValues>(values);
  const { programs: availablePrograms, isLoading: isLoadingPrograms } =
    useProgramsCatalog(PROGRAM_INFO);
  const { activePrograms, isLoading: isLoadingActivePrograms } = useActivePrograms();
  const { latestOneRMs } = useLatestOneRms();
  const loading = isLoadingPrograms || isLoadingActivePrograms;

  const scrollToScheduleSection = useCallback(() => {
    if (scheduleSectionY.current === null || !scrollViewRef.current) {
      return;
    }

    const targetY = Math.max(0, modalContentY.current + scheduleSectionY.current - spacing.sm);
    scrollViewRef.current.scrollTo({ y: targetY, animated: true });
  }, []);

  useEffect(() => {
    if (scheduleStep !== 'schedule') {
      return;
    }

    const shortDelay = setTimeout(scrollToScheduleSection, 50);
    const layoutDelay = setTimeout(scrollToScheduleSection, 250);

    return () => {
      clearTimeout(shortDelay);
      clearTimeout(layoutDelay);
    };
  }, [scheduleStep, scrollToScheduleSection]);

  const hasAllOneRmValues = (oneRmValues: OneRmValues) =>
    Boolean(oneRmValues.squat && oneRmValues.bench && oneRmValues.deadlift && oneRmValues.ohp);

  const setOneRmValues = (nextValues: OneRmValues) => {
    valuesRef.current = nextValues;
    setValues(nextValues);
  };

  const continueToSchedule = () => {
    if (startingProgram || !hasAllOneRmValues(valuesRef.current)) {
      return;
    }

    setReviewConfirmed(false);
    setScheduleStep('schedule');
  };

  const onRefresh = useCallback(async () => {
    setOfflineMessage(null);
    try {
      await handleRefresh();
    } catch (err) {
      setOfflineMessage(getPullToRefreshErrorMessage(err));
    }
  }, [handleRefresh]);

  const _getTotalSessions = (slug: string): number => {
    switch (slug) {
      case 'stronglifts-5x5':
        return 24;
      case '531':
        return 48;
      case 'madcow-5x5':
        return 36;
      case 'candito-6-week':
        return 24;
      case 'nsuns-lp':
        return 32;
      case 'sheiko':
        return 48;
      case 'nuckols-28-programs':
        return 24;
      case 'stronger-by-the-day':
        return 32;
      case 'unapologetically-strong':
        return 24;
      default:
        return 24;
    }
  };

  const handleStartProgram = async () => {
    if (scheduleStep !== 'review') return;

    if (!values.squat || !values.bench || !values.deadlift || !values.ohp) {
      Alert.alert('Missing Values', 'Please enter all your 1RM values to continue.');
      return;
    }

    if (!selectedProgram) return;
    if (!userId) return;

    setOfflineMessage(null);
    setStartingProgram(true);
    try {
      const convertToKg = (value: number) => (weightUnit === 'lbs' ? value * LBS_TO_KG : value);

      const payload = {
        programSlug: selectedProgram.slug,
        name: selectedProgram.name,
        squat1rm: convertToKg(parseFloat(values.squat)),
        bench1rm: convertToKg(parseFloat(values.bench)),
        deadlift1rm: convertToKg(parseFloat(values.deadlift)),
        ohp1rm: convertToKg(parseFloat(values.ohp)),
        preferredGymDays,
        preferredTimeOfDay: preferredTime,
        programStartDate: programStartDate.toISOString().split('T')[0],
        firstSessionDate: firstSessionDate.toISOString().split('T')[0],
      };
      const cycleId = generateId();

      const plan = await createLocalProgramCycleFromStartPayload(userId, {
        id: cycleId,
        ...payload,
      });
      if (!plan) {
        throw new Error('Failed to create program locally. Please try again.');
      }
      await enqueueSyncItem(userId, 'program', cycleId, 'start_program', {
        id: cycleId,
        ...payload,
        cycleWorkouts: plan.cycleWorkouts.map((workout) => ({
          id: workout.id,
          weekNumber: workout.weekNumber,
          sessionNumber: workout.sessionNumber,
        })),
      });
      void syncOfflineQueueAndCache(userId);

      setShowStartModal(false);
      setShowDetailModal(false);
      setSelectedProgram(null);
      setOneRmValues({ squat: '', bench: '', deadlift: '', ohp: '' });
      setScheduleStep('1rm');
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['activePrograms'] }),
        queryClient.refetchQueries({ queryKey: ['latestOneRms'] }),
        queryClient.refetchQueries({ queryKey: ['homeSummary', activeTimezone] }),
      ]);

      router.push(`/(app)/home?focusProgramId=${cycleId}`);
    } catch (e) {
      if (e instanceof OfflineError || (e as Error)?.name === 'OfflineError') {
        setOfflineMessage(
          "Unable to start program. Saved locally — will sync when you're back online.",
        );
        await queryClient.refetchQueries({ queryKey: ['activePrograms'] });
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start program');
      }
    } finally {
      setStartingProgram(false);
    }
  };

  const handleOpenCurrentProgramWorkout = async (program: ActiveProgram) => {
    if (!program.id) {
      return;
    }

    setOfflineMessage(null);
    setOpeningProgramWorkoutId(program.id);
    try {
      if (userId) {
        const local = await createLocalWorkoutFromCurrentProgramCycle(userId, program.id);
        if (local?.id) {
          router.push(`/workout-session?workoutId=${local.id}&source=program`);
          return;
        }
      }
      if (!userId) {
        throw new Error('Not authenticated');
      }

      const definition = await apiFetch<any>(`/api/programs/cycles/${program.id}/workouts/current`);
      if (definition.isComplete) {
        Alert.alert(
          'Session Already Completed',
          'This program session has already been completed.',
        );
        await queryClient.refetchQueries({ queryKey: ['activePrograms'] });
        return;
      }

      const remoteLocal = await createLocalWorkoutFromProgramCycleWorkoutDefinition(
        userId,
        definition,
      );
      if (!remoteLocal?.id) {
        throw new Error('Failed to open current session');
      }

      router.push(
        `/workout-session?workoutId=${remoteLocal.id}&source=program&cycleId=${program.id}&cycleWorkoutId=${remoteLocal.cycleWorkoutId ?? definition.id}`,
      );
    } catch (e) {
      if (e instanceof Error && e.message === 'Network request failed') {
        setOfflineMessage('Unable to open session while offline.');
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open current session');
      }
    } finally {
      setOpeningProgramWorkoutId(null);
    }
  };

  const handleDeleteProgram = (program: ActiveProgram) => {
    Alert.alert('Delete Active Program', `Delete ${program.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingProgramId(program.id);
          try {
            await tryOnlineOrEnqueue({
              apiCall: () => apiFetch(`/api/programs/cycles/${program.id}`, { method: 'DELETE' }),
              userId: userId ?? '',
              entityType: 'program',
              operation: 'delete_program',
              entityId: program.id,
              payload: {},
            });
            await queryClient.refetchQueries({ queryKey: ['activePrograms'] });
          } catch (e) {
            if (e instanceof OfflineError) {
              setOfflineMessage(e.message);
            } else {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete program');
            }
          } finally {
            setDeletingProgramId(null);
          }
        },
      },
    ]);
  };

  const openProgramDetail = (program: ProgramListItem) => {
    setSelectedProgram(program);
    setShowDetailModal(true);
  };

  const openStartModal = () => {
    setOfflineMessage(null);
    if (latestOneRMs) {
      const toDisplay = (value: number | null) => {
        if (value === null) return '';
        return weightUnit === 'lbs' ? (value * 2.20462).toFixed(1) : value.toString();
      };

      setOneRmValues({
        squat: toDisplay(latestOneRMs.squat1rm),
        bench: toDisplay(latestOneRMs.bench1rm),
        deadlift: toDisplay(latestOneRMs.deadlift1rm),
        ohp: toDisplay(latestOneRMs.ohp1rm),
      });
    } else {
      setOneRmValues({ squat: '', bench: '', deadlift: '', ohp: '' });
    }

    const defaultDays: DayOfWeek[] =
      selectedProgram?.daysPerWeek === 4
        ? ['monday', 'wednesday', 'thursday', 'friday']
        : ['monday', 'wednesday', 'friday'];

    const startDate = new Date();
    setPreferredGymDays(defaultDays);
    setPreferredTime('morning');
    setProgramStartDate(startDate);
    setStartMode('smart');
    setFirstSessionDate(startDate);
    setReviewConfirmed(false);
    setShowStartModeChoice(false);
    setScheduleStep('1rm');
    setShowStartModal(true);
  };

  const diffColor = (difficulty: string) => getDifficultyColor(difficulty);

  return (
    <PageLayout
      header={<PageHeader eyebrow="Training Programs" title="Programs" />}
      screenScrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        ),
      }}
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <>
          {activePrograms.length > 0 && (
            <View style={styles.activeSection}>
              <Text style={styles.sectionTitle}>Active Programs</Text>
              {activePrograms.map((program) => (
                <View key={`program:${program.id}`} style={styles.activeCard}>
                  <View style={styles.activeCardHeader}>
                    <View>
                      <Text style={styles.activeCardTitle}>{program.name}</Text>
                      <Text style={styles.activeCardMeta}>
                        Week {program.currentWeek ?? '—'} · Session{' '}
                        {getDisplaySessionNumber(program)} of {program.totalSessionsPlanned}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.activeCardButtons}>
                    {offlineMessage && (
                      <View style={styles.offlineBanner}>
                        <Text style={styles.offlineBannerText}>{offlineMessage}</Text>
                      </View>
                    )}
                    <ActionButton
                      testID={`program-active-start-${program.id}`}
                      label={
                        openingProgramWorkoutId === program.id ? 'Opening...' : 'Start Next Session'
                      }
                      icon="play"
                      onPress={() => handleOpenCurrentProgramWorkout(program)}
                      disabled={openingProgramWorkoutId === program.id}
                    />
                    <View style={styles.activeCardButtonsRow}>
                      <View style={styles.flex1}>
                        <ActionButton
                          testID={`program-active-schedule-${program.id}`}
                          label="View Schedule"
                          icon="calendar-outline"
                          variant="secondary"
                          onPress={() => router.push(`/program-schedule?cycleId=${program.id}`)}
                          disabled={openingProgramWorkoutId === program.id}
                        />
                      </View>
                      <Pressable
                        testID={`program-active-delete-${program.id}`}
                        accessibilityLabel={`program-active-delete-${program.id}`}
                        style={[
                          styles.deleteButton,
                          deletingProgramId === program.id && styles.deleteButtonDisabled,
                        ]}
                        onPress={() => handleDeleteProgram(program)}
                        disabled={deletingProgramId === program.id}
                      >
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>Available Programs</Text>
          <View style={styles.programsList}>
            {availablePrograms.map((program) => {
              const dc = diffColor(program.difficulty);
              return (
                <Pressable
                  testID={`program-option-${program.slug}`}
                  accessibilityLabel={`program-option-${program.slug}`}
                  key={`program-option:${program.slug}`}
                  style={styles.programCard}
                  onPress={() => openProgramDetail(program)}
                >
                  <View style={styles.cardTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{program.name}</Text>
                      <Text style={styles.cardDescription}>{program.description}</Text>
                    </View>
                  </View>
                  <View style={styles.badgeRow}>
                    <View style={[styles.difficultyBadge, { backgroundColor: dc.bg }]}>
                      <Text style={[styles.difficultyText, { color: dc.text }]}>
                        {program.difficulty}
                      </Text>
                    </View>
                    <Text style={styles.separator}>·</Text>
                    <Text style={styles.metaText}>{program.daysPerWeek} days per week</Text>
                    <Text style={styles.separator}>·</Text>
                    <Text style={styles.metaText}>{program.estimatedWeeks} weeks</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Modal
        visible={Boolean(selectedProgram && showDetailModal)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => {
          setShowDetailModal(false);
          setSelectedProgram(null);
        }}
      >
        {selectedProgram ? (
          <ScrollView
            ref={(r) => {
              detailScrollRef.current = r;
            }}
            key={`${showDetailModal}-${selectedProgram?.slug ?? 'none'}`}
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            onLayout={() => {
              requestAnimationFrame(() => {
                detailScrollRef.current?.scrollTo({ y: 0, animated: false });
              });
            }}
          >
            <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
              <Pressable
                style={styles.backButton}
                onPress={() => {
                  setOfflineMessage(null);
                  setShowDetailModal(false);
                  setSelectedProgram(null);
                }}
              >
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={styles.modalTitle}>Program Details</Text>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.programNameTitle}>{selectedProgram.name}</Text>
              <Text style={styles.programDescriptionText}>{selectedProgram.description}</Text>

              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.difficultyBadge,
                    { backgroundColor: diffColor(selectedProgram.difficulty).bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.difficultyText,
                      { color: diffColor(selectedProgram.difficulty).text },
                    ]}
                  >
                    {selectedProgram.difficulty}
                  </Text>
                </View>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.metaText}>{selectedProgram.daysPerWeek} days per week</Text>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.metaText}>{selectedProgram.estimatedWeeks} weeks</Text>
              </View>

              <Pressable
                testID="program-start-this-program"
                accessibilityLabel="program-start-this-program"
                style={styles.primaryButton}
                onPress={() => {
                  setShowDetailModal(false);
                  openStartModal();
                }}
              >
                <Text style={styles.primaryButtonText}>Start This Program</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setShowDetailModal(false);
                  setSelectedProgram(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </Modal>

      <Modal
        visible={showStartModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowStartModal(false)}
      >
        {showStartModal ? (
          <KeyboardFormLayout>
            <FormScrollView
              ref={scrollViewRef}
              style={styles.modalScroll}
              bottomInset={layout.bottomInsetForm}
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
                <Pressable
                  style={styles.backButton}
                  onPress={() => {
                    setOfflineMessage(null);
                    setShowStartModal(false);
                  }}
                >
                  <Ionicons name="chevron-back" size={24} color={colors.text} />
                </Pressable>
                <Text style={styles.modalTitle}>Enter 1RM</Text>
              </View>

              <View
                style={styles.modalContent}
                onLayout={(event) => {
                  modalContentY.current = event.nativeEvent.layout.y;
                }}
              >
                <View style={styles.infoBox}>
                  <Text style={styles.infoBoxTitle}>How to estimate your 1RM</Text>
                  <Text style={styles.infoBoxText}>
                    Your 1RM is the maximum weight you can lift for a single rep with good form. If
                    you're unsure, you can estimate by lifting a weight you can do for 5-8 reps and
                    using the formula: 1RM = weight × (1 + reps/30).
                  </Text>
                </View>

                <Text style={styles.programNameTitle}>Starting Program</Text>
                <Text style={styles.programNameTitle}>{selectedProgram?.name}</Text>
                <Text style={styles.instructionsText}>
                  Enter your current one-rep max (1RM) estimates for each lift. These will be used
                  to calculate your working weights.
                </Text>

                <OneRmInputFields
                  values={values}
                  setOneRmValues={setOneRmValues}
                  valuesRef={valuesRef}
                  weightUnit={weightUnit}
                />

                {scheduleStep === '1rm' && (
                  <>
                    <Pressable
                      testID="program-continue-to-schedule"
                      accessibilityLabel="program-continue-to-schedule"
                      style={[
                        styles.primaryButton,
                        (!hasAllOneRmValues(values) || startingProgram) &&
                          styles.startButtonDisabled,
                      ]}
                      onPressIn={continueToSchedule}
                      onPress={continueToSchedule}
                      accessibilityState={{
                        disabled: !hasAllOneRmValues(values) || startingProgram,
                      }}
                    >
                      <Text style={styles.primaryButtonText}>Continue to Schedule</Text>
                    </Pressable>
                  </>
                )}

                {scheduleStep === 'schedule' && (
                  <View
                    onLayout={(event) => {
                      scheduleSectionY.current = event.nativeEvent.layout.y;
                    }}
                  >
                    <SectionTitle title="Schedule" />
                    <Surface style={styles.scheduleCard}>
                      <Text style={styles.scheduleLabel}>Preferred Training Days</Text>
                      <Text style={styles.scheduleHint}>
                        Select {selectedProgram?.daysPerWeek} days per week
                      </Text>
                      <View style={styles.dayChipsRow}>
                        {(
                          [
                            'monday',
                            'tuesday',
                            'wednesday',
                            'thursday',
                            'friday',
                            'saturday',
                            'sunday',
                          ] as DayOfWeek[]
                        ).map((day) => {
                          const isSelected = preferredGymDays.includes(day);
                          return (
                            <Pressable
                              testID={`program-day-${day}`}
                              accessibilityLabel={`program-day-${day}`}
                              key={`dayChip-${day}`}
                              style={isSelected ? styles.dayChipSelected : styles.dayChip}
                              onPress={() => {
                                setReviewConfirmed(false);
                                if (isSelected) {
                                  setPreferredGymDays((prev) => prev.filter((d) => d !== day));
                                } else if (
                                  preferredGymDays.length < (selectedProgram?.daysPerWeek ?? 3)
                                ) {
                                  setPreferredGymDays((prev) => [...prev, day]);
                                }
                              }}
                            >
                              <Text
                                style={isSelected ? styles.dayChipTextSelected : styles.dayChipText}
                              >
                                {day.charAt(0).toUpperCase()}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Text style={[styles.scheduleLabel, { marginTop: spacing.md }]}>
                        Preferred Time of Day
                      </Text>
                      <View style={styles.timeChipsRow}>
                        {(['morning', 'afternoon', 'evening'] as PreferredTime[]).map((time) => {
                          const isSelected = preferredTime === time;
                          return (
                            <Pressable
                              testID={`program-time-${time}`}
                              accessibilityLabel={`program-time-${time}`}
                              key={`timeChip-${time}`}
                              style={isSelected ? styles.timeChipSelected : styles.timeChip}
                              onPress={() => {
                                setReviewConfirmed(false);
                                setPreferredTime(time);
                              }}
                            >
                              <Text
                                style={
                                  isSelected ? styles.timeChipTextSelected : styles.timeChipText
                                }
                              >
                                {time.charAt(0).toUpperCase() + time.slice(1)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Text style={[styles.scheduleLabel, { marginTop: spacing.md }]}>
                        Program Start Date
                      </Text>
                      <Pressable
                        style={styles.dateButton}
                        onPress={() => {
                          if (Platform.OS === 'ios') {
                            ActionSheetIOS.showActionSheetWithOptions(
                              {
                                options: ['Cancel', 'Select Date'],
                                cancelButtonIndex: 0,
                              },
                              () => setShowDatePicker(true),
                            );
                          } else {
                            setShowDatePicker(true);
                          }
                        }}
                      >
                        <Text style={styles.dateButtonText}>
                          {programStartDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={18}
                          color={colors.text}
                          style={{ marginLeft: spacing.sm }}
                        />
                      </Pressable>

                      {showDatePicker && (
                        <DateTimePicker
                          value={programStartDate}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={(_event: any, selectedDate: any) => {
                            if (Platform.OS === 'android') {
                              setShowDatePicker(false);
                            }
                            if (selectedDate) {
                              const newStartDate = selectedDate;
                              setProgramStartDate(newStartDate);
                              setReviewConfirmed(false);
                              const dayMap: Record<number, DayOfWeek> = {
                                0: 'sunday',
                                1: 'monday',
                                2: 'tuesday',
                                3: 'wednesday',
                                4: 'thursday',
                                5: 'friday',
                                6: 'saturday',
                              };
                              const startDayName = dayMap[newStartDate.getDay()];
                              const isTrainingDay = isFirstSelectedDay(
                                startDayName,
                                preferredGymDays,
                              );
                              if (isTrainingDay) {
                                setFirstSessionDate(newStartDate);
                                setShowStartModeChoice(false);
                              } else {
                                setStartMode('smart');
                                setFirstSessionDate(newStartDate);
                                setShowStartModeChoice(true);
                              }
                            }
                          }}
                        />
                      )}

                      {showStartModeChoice && (
                        <View style={styles.startModeSection}>
                          <Text style={styles.scheduleHint}>
                            {programStartDate.toLocaleDateString('en-US', {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })}{' '}
                            is not a training day. Choose how to start:
                          </Text>
                          <Pressable
                            style={styles.startModeOption}
                            onPress={() => {
                              setReviewConfirmed(false);
                              setStartMode('smart');
                              setFirstSessionDate(programStartDate);
                            }}
                          >
                            <View
                              style={[
                                styles.radioOuter,
                                startMode === 'smart' && styles.radioOuterSelected,
                              ]}
                            >
                              {startMode === 'smart' && <View style={styles.radioInner} />}
                            </View>
                            <View style={styles.startModeTextContainer}>
                              <Text style={styles.startModeTitle}>Smart Start</Text>
                              <Text style={styles.startModeDescription}>
                                Start program today even though it's not a training day
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable
                            style={styles.startModeOption}
                            onPress={() => {
                              setReviewConfirmed(false);
                              setStartMode('strict');
                              setFirstSessionDate(
                                computeFirstSessionDate(
                                  programStartDate,
                                  preferredGymDays,
                                  'strict',
                                ),
                              );
                            }}
                          >
                            <View
                              style={[
                                styles.radioOuter,
                                startMode === 'strict' && styles.radioOuterSelected,
                              ]}
                            >
                              {startMode === 'strict' && <View style={styles.radioInner} />}
                            </View>
                            <View style={styles.startModeTextContainer}>
                              <Text style={styles.startModeTitle}>Strict Start</Text>
                              <Text style={styles.startModeDescription}>
                                First training day is{' '}
                                {firstSessionDate.toLocaleDateString('en-US', {
                                  weekday: 'long',
                                  month: 'long',
                                  day: 'numeric',
                                })}
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable
                            style={styles.primaryButton}
                            onPress={() => {
                              setReviewConfirmed(true);
                              setScheduleStep('review');
                            }}
                          >
                            <Text style={styles.primaryButtonText}>Confirm</Text>
                          </Pressable>
                        </View>
                      )}

                      <View style={styles.firstSessionRow}>
                        <Text style={styles.scheduleLabel}>First Session</Text>
                        <Badge
                          label={firstSessionDate.toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                          tone="emerald"
                        />
                      </View>
                    </Surface>

                    <View style={styles.scheduleButtons}>
                      <Pressable
                        testID="program-continue-to-review"
                        accessibilityLabel="program-continue-to-review"
                        style={[
                          styles.primaryButton,
                          showStartModeChoice && !reviewConfirmed && styles.startButtonDisabled,
                        ]}
                        onPress={() => {
                          const startDayIndex = programStartDate.getDay();
                          const dayMap: Record<number, DayOfWeek> = {
                            0: 'sunday',
                            1: 'monday',
                            2: 'tuesday',
                            3: 'wednesday',
                            4: 'thursday',
                            5: 'friday',
                            6: 'saturday',
                          };
                          const startDayName = dayMap[startDayIndex];
                          if (!isFirstSelectedDay(startDayName, preferredGymDays)) {
                            setShowStartModeChoice(true);
                            setReviewConfirmed(false);
                            // Don't advance to review yet - user needs to choose Smart/Strict
                          } else {
                            setReviewConfirmed(true);
                            setFirstSessionDate(programStartDate);
                            setShowStartModeChoice(false);
                            setScheduleStep('review');
                          }
                        }}
                        disabled={showStartModeChoice && !reviewConfirmed}
                      >
                        <Text style={styles.primaryButtonText}>Continue to Review</Text>
                      </Pressable>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => setScheduleStep('1rm')}
                      >
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {scheduleStep === 'review' && (
                  <>
                    <SectionTitle title="Review" />
                    <Surface style={styles.scheduleCard}>
                      <Text style={styles.reviewProgramName}>{selectedProgram?.name}</Text>
                      <Text style={styles.reviewMeta}>
                        {selectedProgram?.estimatedWeeks} weeks · {selectedProgram?.totalSessions}{' '}
                        sessions · {selectedProgram?.daysPerWeek} days per week
                      </Text>

                      <View style={styles.reviewSection}>
                        <Text style={styles.reviewLabel}>Training Days</Text>
                        <View style={styles.reviewDaysRow}>
                          {preferredGymDays.map((day) => (
                            <Badge
                              key={`reviewDay-${day}`}
                              label={day.charAt(0).toUpperCase() + day.slice(1, 3)}
                              tone="sky"
                            />
                          ))}
                        </View>
                      </View>

                      <View style={styles.reviewSection}>
                        <Text style={styles.reviewLabel}>Preferred Time</Text>
                        <Badge
                          label={preferredTime.charAt(0).toUpperCase() + preferredTime.slice(1)}
                          tone="neutral"
                        />
                      </View>

                      <View style={styles.reviewSection}>
                        <Text style={styles.reviewLabel}>Start Date</Text>
                        <Text style={styles.reviewValue}>
                          {programStartDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </Text>
                      </View>

                      <View style={styles.reviewSection}>
                        <Text style={styles.reviewLabel}>First Session</Text>
                        <Text style={styles.reviewValue}>
                          {firstSessionDate.toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </Text>
                      </View>
                    </Surface>

                    <View style={styles.scheduleButtons}>
                      {offlineMessage && (
                        <View style={[styles.offlineBanner, { marginBottom: spacing.md }]}>
                          <Text style={styles.offlineBannerText}>{offlineMessage}</Text>
                        </View>
                      )}
                      <Pressable
                        testID="program-confirm-start"
                        accessibilityLabel="program-confirm-start"
                        style={[
                          styles.startButton,
                          (startingProgram || !reviewConfirmed) && styles.startButtonDisabled,
                        ]}
                        onPress={handleStartProgram}
                        disabled={startingProgram || !reviewConfirmed}
                      >
                        {startingProgram ? (
                          <View style={styles.startButtonRow}>
                            <ActivityIndicator size="small" color={colors.text} />
                            <Text style={styles.startButtonText}>Starting Program...</Text>
                          </View>
                        ) : (
                          <Text style={styles.startButtonText}>Confirm & Start Program</Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => {
                          setOfflineMessage(null);
                          setReviewConfirmed(false);
                          setScheduleStep('schedule');
                          setTimeout(() => {
                            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                          }, 100);
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>Back</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            </FormScrollView>
          </KeyboardFormLayout>
        ) : null}
      </Modal>
    </PageLayout>
  );
}

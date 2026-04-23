import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
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
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '@/lib/api';
import { addPendingWorkout } from '@/lib/storage';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { PageLayout } from '@/components/ui/PageLayout';
import { PageHeader } from '@/components/ui/app-primitives';
import {
  useActivePrograms,
  useLatestOneRms,
  useProgramsCatalog,
  type ActiveProgram,
  type ProgramListItem,
} from '@/hooks/usePrograms';
import { ActionButton, Badge, SectionTitle, Surface } from '@/components/ui/app-primitives';
import { colors, spacing, radius, typography, layout } from '@/theme';

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
    estimatedWeeks: 8,
    totalSessions: 24,
  },
  {
    slug: '531',
    name: 'Wendler 5/3/1',
    description:
      'A time-tested strength program that uses wave loading and AMRAP sets to build real strength.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 12,
    totalSessions: 48,
  },
  {
    slug: 'madcow-5x5',
    name: 'MadCow 5×5',
    description:
      'An intermediate progression from StrongLifts with more volume and progressive overload.',
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 12,
    totalSessions: 36,
  },
  {
    slug: 'candito-6-week',
    name: 'Candito 6-Week',
    description:
      'A high-volume powerlifting program designed for intermediates looking to break through plateaus.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 6,
    totalSessions: 24,
  },
  {
    slug: 'nsuns-lp',
    name: 'nSuns LP',
    description:
      'A high-volume linear progression program that builds impressive strength and volume.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'sheiko',
    name: 'Sheiko',
    description: 'A Russian-inspired powerlifting program known for its high frequency and volume.',
    difficulty: 'advanced',
    daysPerWeek: 4,
    estimatedWeeks: 12,
    totalSessions: 48,
  },
  {
    slug: 'nuckols-28-programs',
    name: 'Nuckols 28 Programs',
    description: 'A customizable program system by Greg Nuckols with options for all skill levels.',
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 8,
    totalSessions: 24,
  },
  {
    slug: 'stronger-by-the-day',
    name: 'Stronger By The Day',
    description: "Megsquats' program designed to build lasting strength with smart periodization.",
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'unapologetically-strong',
    name: 'Unapologetically Strong',
    description: "Jen Sinkler's program focused on building functional strength for women.",
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
  },
  cardDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginTop: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  difficultyBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  difficultyText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'capitalize',
  },
  separator: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
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
  },
  infoBoxText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    lineHeight: 18,
  },
  programNameTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.sm,
  },
  programDescriptionText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  instructionsText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
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
    fontSize: 20,
  },
  inputLabel: {
    color: colors.text,
    fontWeight: typography.fontWeights.medium,
  },
  inputUnit: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  textInput: {
    color: colors.text,
    fontSize: 24,
    fontWeight: typography.fontWeights.bold,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  },
  dayChipTextSelected: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
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
  },
  timeChipTextSelected: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
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
  },
  scheduleHint: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
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
  },
  startModeDescription: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
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
  },
  reviewMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.lg,
  },
  reviewSection: {
    marginBottom: spacing.md,
  },
  reviewLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginBottom: spacing.xs,
  },
  reviewDaysRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  reviewValue: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
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
  },
  activeCardMeta: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
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
    borderColor: 'rgba(244,63,94,0.2)',
    backgroundColor: 'rgba(244,63,94,0.1)',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.error,
  },
});

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case 'beginner':
      return { bg: '#22c55e20', text: '#4ade80' };
    case 'intermediate':
      return { bg: '#f59e0b20', text: '#fbbf24' };
    case 'advanced':
      return { bg: '#ef444420', text: '#f87171' };
    default:
      return { bg: colors.surfaceAlt, text: colors.textMuted };
  }
}

export default function ProgramsScreen() {
  const router = useRouter();
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramListItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [startingProgram, setStartingProgram] = useState(false);
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
  const inputRefs = useRef<Record<string, any>>({});
  const modalContentY = useRef(0);
  const inputGroupY = useRef(0);
  const scheduleSectionY = useRef<number | null>(null);
  const inputCardLayouts = useRef<Record<string, number>>({});
  const valuesRef = useRef<OneRmValues>(values);
  const inputOrder = ['squat', 'bench', 'deadlift', 'ohp'] as const;
  const { programs: availablePrograms, isLoading: isLoadingPrograms } =
    useProgramsCatalog(PROGRAM_INFO);
  const {
    activePrograms,
    isLoading: isLoadingActivePrograms,
    refetch: refetchActivePrograms,
  } = useActivePrograms();
  const { latestOneRMs, refetch: refetchLatestOneRms } = useLatestOneRms();
  const loading = isLoadingPrograms || isLoadingActivePrograms;

  const handleInputCardLayout = (key: string, event: LayoutChangeEvent) => {
    inputCardLayouts.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToInputByKey = (key: string) => {
    const cardY = inputCardLayouts.current[key];
    if (typeof cardY === 'number' && scrollViewRef.current) {
      const inputY = modalContentY.current + inputGroupY.current + cardY;
      const targetY = Math.max(0, inputY - 120);
      scrollViewRef.current.scrollTo({ y: targetY, animated: true });
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }, 250);
      return;
    }

    const inputRef = inputRefs.current[key];
    if (inputRef && scrollViewRef.current) {
      inputRef.measure(
        (
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          _pageX: number,
          pageY: number,
        ) => {
          const KEYBOARD_HEIGHT = 300;
          const TOP_OFFSET = 100;
          const targetY = Math.max(0, pageY - KEYBOARD_HEIGHT - TOP_OFFSET);
          scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
        },
      );
    }
  };

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

  const focusNextInput = (key: (typeof inputOrder)[number]) => {
    const currentIndex = inputOrder.indexOf(key);
    const nextKey = inputOrder[currentIndex + 1];

    if (nextKey) {
      inputRefs.current[nextKey]?.focus();
    }
  };

  const hasAllOneRmValues = (oneRmValues: OneRmValues) =>
    Boolean(oneRmValues.squat && oneRmValues.bench && oneRmValues.deadlift && oneRmValues.ohp);

  const setOneRmValues = (nextValues: OneRmValues) => {
    valuesRef.current = nextValues;
    setValues(nextValues);
  };

  const updateOneRmValue = (key: keyof OneRmValues, value: string) => {
    const nextValue = value.replace(/[^0-9.]/g, '');
    setOneRmValues({ ...valuesRef.current, [key]: nextValue });
  };

  const continueToSchedule = () => {
    if (startingProgram || !hasAllOneRmValues(valuesRef.current)) {
      return;
    }

    setReviewConfirmed(false);
    setScheduleStep('schedule');
  };

  const refreshProgramsScreen = useCallback(
    async (showRefreshIndicator = false) => {
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      }

      try {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['programs'] }),
          refetchActivePrograms(),
          refetchLatestOneRms(),
        ]);
      } finally {
        if (showRefreshIndicator) {
          setIsRefreshing(false);
        }
      }
    },
    [queryClient, refetchActivePrograms, refetchLatestOneRms],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshProgramsScreen();
    }, [refreshProgramsScreen]),
  );

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

    setStartingProgram(true);
    try {
      const convertToKg = (value: number) => (weightUnit === 'lbs' ? value * LBS_TO_KG : value);

      const cycle = await apiFetch<{ id: string }>('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          timezone: activeTimezone,
        }),
      });

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

      if (cycle.id) {
        router.push(`/(app)/home?focusProgramId=${cycle.id}`);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start program');
    } finally {
      setStartingProgram(false);
    }
  };

  const handleOpenCurrentProgramWorkout = async (program: ActiveProgram) => {
    if (!program.id) {
      return;
    }

    setOpeningProgramWorkoutId(program.id);
    try {
      const result = await apiFetch<{
        workoutId: string;
        sessionName: string;
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycles/${program.id}/workouts/current/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: activeTimezone }),
      });

      if (result.completed) {
        Alert.alert(
          'Session Already Completed',
          'This program session has already been completed.',
        );
        await queryClient.refetchQueries({ queryKey: ['activePrograms'] });
        return;
      }

      await addPendingWorkout({
        id: result.workoutId,
        name: result.sessionName,
        startedAt: new Date().toISOString(),
        completedAt: null,
        source: 'program',
        programCycleId: program.id,
        cycleWorkoutId: result.workoutId,
        exercises: [],
        exerciseCount: 0,
        durationMinutes: null,
        totalVolume: null,
        totalSets: null,
      });

      router.push(`/workout-session?workoutId=${result.workoutId}&source=program`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open current session');
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
            await apiFetch(`/api/programs/cycles/${program.id}`, { method: 'DELETE' });
            await queryClient.refetchQueries({ queryKey: ['activePrograms'] });
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete program');
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
            onRefresh={() => {
              void refreshProgramsScreen(true);
            }}
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
                    <ActionButton
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
                          label="View Schedule"
                          icon="calendar-outline"
                          variant="secondary"
                          onPress={() => router.push(`/program-schedule?cycleId=${program.id}`)}
                          disabled={openingProgramWorkoutId === program.id}
                        />
                      </View>
                      <Pressable
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
                    <Text style={styles.metaText}>{program.daysPerWeek} days/week</Text>
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
                <Text style={styles.metaText}>{selectedProgram.daysPerWeek} days/week</Text>
                <Text style={styles.separator}>·</Text>
                <Text style={styles.metaText}>{selectedProgram.estimatedWeeks} weeks</Text>
              </View>

              <Pressable
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
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView
              ref={scrollViewRef}
              style={styles.modalScroll}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 400,
              }}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
            >
              <View style={[styles.modalHeader, { paddingTop: insets.top + spacing.md }]}>
                <Pressable style={styles.backButton} onPress={() => setShowStartModal(false)}>
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

                <View
                  style={styles.inputGroup}
                  onLayout={(event) => {
                    inputGroupY.current = event.nativeEvent.layout.y;
                  }}
                >
                  {[
                    { key: 'squat', label: 'Squat 1RM', icon: '🏋️' },
                    { key: 'bench', label: 'Bench Press 1RM', icon: '💪' },
                    { key: 'deadlift', label: 'Deadlift 1RM', icon: '🦵' },
                    { key: 'ohp', label: 'Overhead Press 1RM', icon: '🙆' },
                  ].map(({ key, label, icon }) => (
                    <View
                      key={`program-1rm:${key}`}
                      style={styles.inputCard}
                      onLayout={(event) => handleInputCardLayout(key, event)}
                    >
                      <View style={styles.inputHeaderRow}>
                        <View style={styles.inputLabelRow}>
                          <Text style={styles.inputIcon}>{icon}</Text>
                          <Text style={styles.inputLabel}>{label}</Text>
                        </View>
                        <Text style={styles.inputUnit}>{weightUnit}</Text>
                      </View>
                      <TextInput
                        ref={(ref) => {
                          inputRefs.current[key] = ref;
                        }}
                        style={styles.textInput}
                        value={values[key as keyof typeof values]}
                        onChangeText={(v) => updateOneRmValue(key as keyof OneRmValues, v)}
                        onFocus={() => scrollToInputByKey(key)}
                        placeholder="0"
                        placeholderTextColor={colors.placeholderText}
                        keyboardType="decimal-pad"
                        returnKeyType={key === 'ohp' ? 'done' : 'next'}
                        blurOnSubmit={key === 'ohp'}
                        onSubmitEditing={() => focusNextInput(key as (typeof inputOrder)[number])}
                      />
                    </View>
                  ))}
                </View>

                {scheduleStep === '1rm' && (
                  <>
                    <Pressable
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
                          onValueChange={(_event, selectedDate) => {
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
                        sessions · {selectedProgram?.daysPerWeek} days/week
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
                      <Pressable
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
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
      </Modal>
    </PageLayout>
  );
}

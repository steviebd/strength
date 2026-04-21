import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '@/lib/api';
import { addPendingWorkout } from '@/lib/storage';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing, radius, typography, layout } from '@/theme';

const LBS_TO_KG = 0.453592;

interface ProgramListItem {
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  daysPerWeek: number;
  estimatedWeeks: number;
  totalSessions: number;
}

interface ActiveProgram {
  id: string;
  programSlug: string;
  name: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
}

interface LatestOneRMs {
  squat1rm: number | null;
  bench1rm: number | null;
  deadlift1rm: number | null;
  ohp1rm: number | null;
}

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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  headerTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.normal,
    marginTop: spacing.xs,
  },
  headerRow: {
    marginBottom: spacing.lg,
  },
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
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  modalScroll: {
    flex: 1,
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
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.xs,
  },
  programNameValue: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.sm,
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
    flexDirection: 'row',
    gap: spacing.sm,
  },
  activeOpenButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  activeOpenButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  activeDeleteButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDeleteButtonText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
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
  const [availablePrograms, setAvailablePrograms] = useState<ProgramListItem[]>(PROGRAM_INFO);
  const [activePrograms, setActivePrograms] = useState<ActiveProgram[]>([]);
  const [latestOneRMs, setLatestOneRMs] = useState<LatestOneRMs | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramListItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [startingProgram, setStartingProgram] = useState(false);
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [values, setValues] = useState({ squat: '', bench: '', deadlift: '', ohp: '' });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const { weightUnit } = useUserPreferences();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<any>(null);
  const inputRefs = useRef<Record<string, any>>({});
  const inputPositions = useRef<Record<string, number>>({});
  const activeInputKey = useRef<string | null>(null);
  const keyboardHeight = useRef(0);
  const scrollViewportHeight = useRef(0);
  const scrollOffsetY = useRef(0);
  const pendingScrollTimeouts = useRef<number[]>([]);
  const inputOrder = ['squat', 'bench', 'deadlift', 'ohp'] as const;

  const scrollToInput = (key: string) => {
    const scrollView = scrollViewRef.current;
    if (!scrollView || scrollViewportHeight.current === 0) {
      return;
    }

    const inputY = inputPositions.current[key];
    if (inputY === undefined) {
      return;
    }

    const desiredTopOffset = Platform.OS === 'android' ? 8 : 24;
    const targetY = Math.max(0, inputY - desiredTopOffset);

    scrollView.scrollTo({ y: targetY, animated: true });
  };

  const clearPendingScrolls = () => {
    pendingScrollTimeouts.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingScrollTimeouts.current = [];
  };

  const scheduleScrollToInput = (key: string) => {
    clearPendingScrolls();
    [0, 120, 280, 420].forEach((delay) => {
      const timeoutId = setTimeout(() => {
        if (activeInputKey.current === key) {
          scrollToInput(key);
        }
      }, delay);
      pendingScrollTimeouts.current.push(timeoutId as unknown as number);
    });
  };

  const focusNextInput = (key: (typeof inputOrder)[number]) => {
    const currentIndex = inputOrder.indexOf(key);
    const nextKey = inputOrder[currentIndex + 1];

    if (nextKey) {
      inputRefs.current[nextKey]?.focus();
    }
  };

  const handleInputLayout =
    (key: string) =>
    (event: LayoutChangeEvent): void => {
      inputPositions.current[key] = event.nativeEvent.layout.y;
    };

  useEffect(() => {
    void fetchProgramsScreenData();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardHeight.current = event.endCoordinates.height;
      setKeyboardInset(event.endCoordinates.height);

      if (activeInputKey.current) {
        scheduleScrollToInput(activeInputKey.current);
      }
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      setKeyboardInset(0);
      clearPendingScrolls();
    });

    return () => {
      clearPendingScrolls();
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  async function fetchProgramsScreenData() {
    try {
      const [programs, activeProgramsData] = await Promise.all([
        apiFetch<ProgramListItem[]>('/api/programs'),
        apiFetch<ActiveProgram[]>('/api/programs/active'),
      ]);
      setAvailablePrograms(
        Array.isArray(programs) && programs.length > 0 ? programs : PROGRAM_INFO,
      );
      setActivePrograms(Array.isArray(activeProgramsData) ? activeProgramsData : []);
      try {
        const latestOneRMsData = await apiFetch<LatestOneRMs | null>('/api/programs/latest-1rms');
        setLatestOneRMs(latestOneRMsData);
      } catch {
        setLatestOneRMs(null);
      }
    } catch (e) {
      console.error('Failed to fetch programs:', e);
    } finally {
      setLoading(false);
    }
  }

  const getTotalSessions = (slug: string): number => {
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
    if (!values.squat || !values.bench || !values.deadlift || !values.ohp) {
      Alert.alert('Missing Values', 'Please enter all your 1RM values to continue.');
      return;
    }

    if (!selectedProgram) return;

    setStartingProgram(true);
    try {
      const convertToKg = (value: number) => (weightUnit === 'lbs' ? value * LBS_TO_KG : value);

      await apiFetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programSlug: selectedProgram.slug,
          name: selectedProgram.name,
          squat1rm: convertToKg(parseFloat(values.squat)),
          bench1rm: convertToKg(parseFloat(values.bench)),
          deadlift1rm: convertToKg(parseFloat(values.deadlift)),
          ohp1rm: convertToKg(parseFloat(values.ohp)),
          totalSessionsPlanned: getTotalSessions(selectedProgram.slug),
          estimatedWeeks: selectedProgram.estimatedWeeks,
        }),
      });

      setShowStartModal(false);
      setShowDetailModal(false);
      setSelectedProgram(null);
      setValues({ squat: '', bench: '', deadlift: '', ohp: '' });
      await fetchProgramsScreenData();
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
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycles/${program.id}/workouts/current/start`, {
        method: 'POST',
      });

      if (result.completed) {
        Alert.alert(
          'Session Already Completed',
          'This program session has already been completed.',
        );
        await fetchProgramsScreenData();
        return;
      }

      await addPendingWorkout({
        id: result.workoutId,
        name: program.name,
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
            await fetchProgramsScreenData();
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

      setValues({
        squat: toDisplay(latestOneRMs.squat1rm),
        bench: toDisplay(latestOneRMs.bench1rm),
        deadlift: toDisplay(latestOneRMs.deadlift1rm),
        ohp: toDisplay(latestOneRMs.ohp1rm),
      });
    }
    setShowStartModal(true);
  };

  const diffColor = (difficulty: string) => getDifficultyColor(difficulty);

  return (
    <Screen style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Programs</Text>
          <Text style={styles.headerSubtitle}>Training Programs</Text>
        </View>

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
                  <View key={program.id} style={styles.activeCard}>
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
                      <Pressable
                        style={styles.activeOpenButton}
                        onPress={() => handleOpenCurrentProgramWorkout(program)}
                        disabled={openingProgramWorkoutId === program.id}
                      >
                        {openingProgramWorkoutId === program.id ? (
                          <ActivityIndicator size="small" color={colors.text} />
                        ) : (
                          <Text style={styles.activeOpenButtonText}>Continue Workout</Text>
                        )}
                      </Pressable>
                      <Pressable
                        style={styles.activeDeleteButton}
                        onPress={() => handleDeleteProgram(program)}
                        disabled={deletingProgramId === program.id}
                      >
                        {deletingProgramId === program.id ? (
                          <ActivityIndicator size="small" color={colors.error} />
                        ) : (
                          <Text style={styles.activeDeleteButtonText}>Delete</Text>
                        )}
                      </Pressable>
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
                    key={program.slug}
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
      </ScrollView>

      {selectedProgram && showDetailModal && (
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalHeader}>
              <Pressable style={styles.backButton} onPress={() => setShowDetailModal(false)}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={styles.modalTitle}>Program Details</Text>
            </View>

            <View style={styles.modalContent}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  setShowDetailModal(false);
                  openStartModal();
                }}
              >
                <Text style={styles.primaryButtonText}>Start This Program</Text>
              </Pressable>

              <Pressable style={styles.secondaryButton} onPress={() => setShowDetailModal(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}

      {showStartModal && (
        <View style={styles.modalOverlay}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.modalScroll}
            contentContainerStyle={{
              paddingBottom: keyboardInset + insets.bottom + Math.max(520, viewportHeight * 1.35),
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onLayout={(event) => {
              scrollViewportHeight.current = event.nativeEvent.layout.height;
              setViewportHeight(event.nativeEvent.layout.height);
            }}
            onScroll={(event) => {
              scrollOffsetY.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
            <View style={styles.modalHeader}>
              <Pressable style={styles.backButton} onPress={() => setShowStartModal(false)}>
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </Pressable>
              <Text style={styles.modalTitle}>Enter 1RM</Text>
            </View>

            <View style={styles.modalContent}>
              <View style={styles.infoBox}>
                <Text style={styles.infoBoxTitle}>How to estimate your 1RM</Text>
                <Text style={styles.infoBoxText}>
                  Your 1RM is the maximum weight you can lift for a single rep with good form. If
                  you're unsure, you can estimate by lifting a weight you can do for 5-8 reps and
                  using the formula: 1RM = weight × (1 + reps/30).
                </Text>
              </View>

              <Text style={styles.programNameTitle}>Starting Program</Text>
              <Text style={styles.programNameValue}>{selectedProgram?.name}</Text>
              <Text style={styles.instructionsText}>
                Enter your current one-rep max (1RM) estimates for each lift. These will be used to
                calculate your working weights.
              </Text>

              <View style={styles.inputGroup}>
                {[
                  { key: 'squat', label: 'Squat 1RM', icon: '🏋️' },
                  { key: 'bench', label: 'Bench Press 1RM', icon: '💪' },
                  { key: 'deadlift', label: 'Deadlift 1RM', icon: '🦵' },
                  { key: 'ohp', label: 'Overhead Press 1RM', icon: '🙆' },
                ].map(({ key, label, icon }) => (
                  <View key={key} style={styles.inputCard}>
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
                      onLayout={handleInputLayout(key)}
                      value={values[key as keyof typeof values]}
                      onChangeText={(v) =>
                        setValues((prev) => ({ ...prev, [key]: v.replace(/[^0-9.]/g, '') }))
                      }
                      onFocus={() => {
                        activeInputKey.current = key;
                        scheduleScrollToInput(key);
                      }}
                      onBlur={() => {
                        if (activeInputKey.current === key) {
                          activeInputKey.current = null;
                        }
                        clearPendingScrolls();
                      }}
                      placeholder="0"
                      placeholderTextColor="#71717a"
                      keyboardType="decimal-pad"
                      returnKeyType={key === 'ohp' ? 'done' : 'next'}
                      blurOnSubmit={key === 'ohp'}
                      onSubmitEditing={() => focusNextInput(key as (typeof inputOrder)[number])}
                    />
                  </View>
                ))}
              </View>

              <Pressable
                style={[styles.startButton, startingProgram && styles.startButtonDisabled]}
                onPress={handleStartProgram}
                disabled={startingProgram}
              >
                {startingProgram ? (
                  <View style={styles.startButtonRow}>
                    <ActivityIndicator size="small" color={colors.text} />
                    <Text style={styles.startButtonText}>Starting Program...</Text>
                  </View>
                ) : (
                  <Text style={styles.startButtonText}>Start Program</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}
    </Screen>
  );
}

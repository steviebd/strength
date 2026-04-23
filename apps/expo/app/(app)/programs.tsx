import { useCallback, useState, useRef } from 'react';
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
} from 'react-native';
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
import { colors, spacing, radius, typography, layout } from '@/theme';

const LBS_TO_KG = 0.453592;

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
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramListItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [startingProgram, setStartingProgram] = useState(false);
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [values, setValues] = useState({ squat: '', bench: '', deadlift: '', ohp: '' });
  const { activeTimezone, weightUnit } = useUserPreferences();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const detailScrollRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, any>>({});
  const modalContentY = useRef(0);
  const inputGroupY = useRef(0);
  const inputCardLayouts = useRef<Record<string, number>>({});
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
      const targetY = Math.max(0, inputY - 96);
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

  const focusNextInput = (key: (typeof inputOrder)[number]) => {
    const currentIndex = inputOrder.indexOf(key);
    const nextKey = inputOrder[currentIndex + 1];

    if (nextKey) {
      inputRefs.current[nextKey]?.focus();
    }
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
          totalSessionsPlanned: getTotalSessions(selectedProgram.slug),
          estimatedWeeks: selectedProgram.estimatedWeeks,
          timezone: activeTimezone,
        }),
      });

      setShowStartModal(false);
      setShowDetailModal(false);
      setSelectedProgram(null);
      setValues({ squat: '', bench: '', deadlift: '', ohp: '' });
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['activePrograms'] }),
        queryClient.refetchQueries({ queryKey: ['latestOneRms'] }),
      ]);

      if (cycle.id) {
        router.push(`/(app)/workouts?focusProgramId=${cycle.id}`);
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
              keyboardShouldPersistTaps="handled"
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
                        onChangeText={(v) =>
                          setValues((prev) => ({ ...prev, [key]: v.replace(/[^0-9.]/g, '') }))
                        }
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
          </KeyboardAvoidingView>
        ) : null}
      </Modal>
    </PageLayout>
  );
}

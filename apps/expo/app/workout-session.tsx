import { useState, useCallback, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ActivityIndicator,
  LayoutChangeEvent,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkoutSessionContext } from '@/context/WorkoutSessionContext';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { PageLayout } from '@/components/ui/PageLayout';
import { ExerciseLogger } from '@/components/workout/ExerciseLogger';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import { apiFetch } from '@/lib/api';
import { removePendingWorkout } from '@/lib/storage';
import type { Workout, ExerciseLibraryItem } from '@/context/WorkoutSessionContext';
import { ScrollProvider } from '@/context/ScrollContext';
import { colors, spacing, radius, typography } from '@/theme';

interface ExerciseLayout {
  id: string;
  y: number;
  height: number;
}

async function fetchWorkout(workoutId: string): Promise<Workout> {
  return apiFetch<Workout>(`/api/workouts/${workoutId}`);
}

export default function WorkoutSessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { workoutId, source, cycleId } = useLocalSearchParams<{
    workoutId?: string;
    source?: string;
    cycleId?: string;
  }>();
  const {
    workout,
    exercises,
    isLoading,
    error,
    formattedDuration,
    isActive,
    weightUnit,
    startWorkout,
    loadWorkout,
    completeWorkout,
    discardWorkout,
    addExercise,
    addSet,
    updateSet,
    deleteSet,
  } = useWorkoutSessionContext();

  const [showAddExercise, setShowAddExercise] = useState(false);
  const [workoutName, setWorkoutName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [exerciseLayouts, setExerciseLayouts] = useState<ExerciseLayout[]>([]);
  const [showFloatingPill, setShowFloatingPill] = useState(false);
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<any>(null);
  const { weightUnit: userWeightUnit } = useUserPreferences();

  const SET_HEIGHT = 120;

  const {
    data: loadedWorkout,
    isLoading: isLoadingWorkout,
    error: loadError,
  } = useQuery({
    queryKey: ['workout', workoutId],
    queryFn: () => fetchWorkout(workoutId!),
    enabled: !!workoutId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (loadedWorkout) {
      loadWorkout(loadedWorkout);
    }
  }, [loadedWorkout, loadWorkout]);

  useEffect(() => {
    if (!workoutId) {
      if (workout?.completedAt && !isActive) {
        router.replace('/(app)/workouts');
      }
    }
  }, [workout?.completedAt, isActive, router, workoutId, workout]);

  const KG_TO_LBS = 2.20462;

  const isViewingCompleted = !!workoutId && !!workout?.completedAt;
  const isProgramSession = source === 'program';
  const isProgramOneRMTest = source === 'program-1rm-test';

  const computedVolume = exercises.reduce((total, ex) => {
    return (
      total +
      ex.sets.reduce((setTotal, set) => {
        if (set.isComplete && set.weight && set.reps) {
          const weight = userWeightUnit === 'lbs' ? set.weight * KG_TO_LBS : set.weight;
          return setTotal + weight * set.reps;
        }
        return setTotal;
      }, 0)
    );
  }, 0);

  const formatVolume = (volume: number) => {
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k`;
    return volume.toString();
  };

  const handleStartWorkout = useCallback(async () => {
    const name = workoutName.trim() || 'Workout';
    await startWorkout(name);
  }, [startWorkout, workoutName]);

  const handleAddExercise = useCallback(
    async (exercisesList: ExerciseLibraryItem[]) => {
      console.log(
        '[DEBUG handleAddExercise] Received exercises:',
        exercisesList.map((e) => e.name),
      );
      for (const exercise of exercisesList) {
        console.log('[DEBUG handleAddExercise] Calling addExercise for:', exercise.name);
        await addExercise(exercise);
      }
      console.log('[DEBUG handleAddExercise] Done. Context exercises count:', exercises.length);
    },
    [addExercise, exercises.length],
  );

  const handleExerciseSetsUpdate = useCallback(
    (workoutExerciseId: string, sets: any[]) => {
      const exerciseIndex = exercises.findIndex((e) => e.id === workoutExerciseId);
      const prevSets = exerciseIndex >= 0 ? exercises[exerciseIndex].sets : [];

      exercises
        .find((e) => e.id === workoutExerciseId)
        ?.sets.forEach((set, idx) => {
          if (sets[idx]) {
            updateSet(set.id, {
              weight: sets[idx].weight,
              reps: sets[idx].reps,
              isComplete: sets[idx].completed,
            });
          }
        });

      const wasSetComplete = prevSets.map((s) => s.isComplete);
      const isSetComplete = sets.map((s: any) => s.completed);

      const justCompletedIndex = isSetComplete.findIndex(
        (completed: boolean, idx: number) => completed && !wasSetComplete[idx],
      );

      if (justCompletedIndex >= 0) {
        const nextSetIndex = justCompletedIndex + 1;
        if (nextSetIndex < sets.length) {
          setCurrentSetIndex(nextSetIndex);
          setCurrentExerciseIndex(exerciseIndex);
          const layout = exerciseLayouts.find((l) => l.id === workoutExerciseId);
          if (layout && scrollViewRef.current) {
            scrollViewRef.current.scrollTo({
              y: layout.y + justCompletedIndex * SET_HEIGHT + 80,
              animated: true,
            });
          }
        } else if (nextSetIndex === sets.length) {
          const nextExerciseIndex = exerciseIndex + 1;
          if (nextExerciseIndex < exercises.length) {
            setCurrentExerciseIndex(nextExerciseIndex);
            setCurrentSetIndex(0);
            const nextLayout = exerciseLayouts.find(
              (l) => l.id === exercises[nextExerciseIndex].id,
            );
            if (nextLayout && scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: nextLayout.y - 80,
                animated: true,
              });
            }
          }
        }
      }

      const anyIncomplete = exercises.some((e) => e.sets.some((s) => !s.isComplete));
      setShowFloatingPill(anyIncomplete);
    },
    [exercises, updateSet, exerciseLayouts],
  );

  const handleDeleteSet = useCallback(
    (workoutExerciseId: string, setId: string) => {
      deleteSet(setId);
    },
    [deleteSet],
  );

  const handleExerciseLayout = useCallback(
    (exerciseId: string, event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      setExerciseLayouts((prev) => {
        const filtered = prev.filter((l) => l.id !== exerciseId);
        return [...filtered, { id: exerciseId, y, height }].sort((a, b) => {
          const aIndex = exercises.findIndex((e) => e.id === a.id);
          const bIndex = exercises.findIndex((e) => e.id === b.id);
          return aIndex - bIndex;
        });
      });
    },
    [exercises],
  );

  const scrollToCurrentExercise = useCallback(() => {
    const layout = exerciseLayouts.find((l) => l.id === exercises[currentExerciseIndex]?.id);
    if (layout && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        y: layout.y - 80,
        animated: true,
      });
    }
  }, [exerciseLayouts, exercises, currentExerciseIndex]);

  const handleCompleteWorkout = useCallback(async () => {
    await completeWorkout();
    if (workoutId && isProgramSession) {
      await removePendingWorkout(workoutId);
    }
    if (workoutId) {
      queryClient.invalidateQueries({ queryKey: ['workout', workoutId] });
    }
    queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
    if (isProgramOneRMTest && typeof cycleId === 'string') {
      router.push(`/program-1rm-test?cycleId=${cycleId}`);
      return;
    }
    router.push(isProgramSession ? '/(app)/programs' : '/(app)/workouts?view=history');
  }, [
    completeWorkout,
    cycleId,
    isProgramOneRMTest,
    isProgramSession,
    queryClient,
    router,
    workoutId,
  ]);

  if (workoutId && isLoadingWorkout) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading workout...</Text>
      </View>
    );
  }

  if (workoutId && loadError) {
    return (
      <View style={[styles.container, styles.centered, { paddingHorizontal: spacing.lg }]}>
        <Text style={styles.errorTitle}>Error Loading Workout</Text>
        <Text style={styles.errorMessage}>{loadError?.message || 'Failed to load workout'}</Text>
        <Pressable style={styles.goToWorkoutsButton} onPress={() => router.push('/(app)/workouts')}>
          <Text style={styles.goToWorkoutsButtonText}>Go to Workouts</Text>
        </Pressable>
      </View>
    );
  }

  if (!isActive && !workout && !workoutId) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.startWorkoutTitle}>Start Workout</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Workout Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g., Upper Body Day"
            placeholderTextColor={colors.placeholderText}
            value={workoutName}
            onChangeText={setWorkoutName}
          />
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.startButton, isLoading && styles.startButtonDisabled]}
          onPress={handleStartWorkout}
          disabled={isLoading}
        >
          <Text style={styles.startButtonText}>{isLoading ? 'Starting...' : 'Start Workout'}</Text>
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const renderActionButtons = () => {
    const buttons = isViewingCompleted
      ? [
          {
            label: isEditing ? 'Cancel Edit' : 'Edit',
            variant: 'secondary' as const,
            onPress: () => setIsEditing(!isEditing),
          },
          {
            label: 'Close',
            variant: 'primary' as const,
            onPress: () => router.push(isProgramSession ? '/(app)/programs' : '/(app)/workouts'),
          },
        ]
      : [
          {
            label: 'Discard',
            variant: 'secondary' as const,
            onPress: async () => {
              await discardWorkout();
              if (isProgramOneRMTest && typeof cycleId === 'string') {
                router.push(`/program-1rm-test?cycleId=${cycleId}`);
                return;
              }
              router.push('/(app)/workouts');
            },
          },
          { label: 'Complete', variant: 'primary' as const, onPress: handleCompleteWorkout },
        ];

    return (
      <View style={styles.actionButtonsRow}>
        {buttons.map((btn, idx) => (
          <Pressable
            key={idx}
            style={[
              styles.actionButton,
              btn.variant === 'primary' ? styles.actionButtonPrimary : styles.actionButtonSecondary,
            ]}
            onPress={btn.onPress}
          >
            <Text
              style={[
                styles.actionButtonText,
                btn.variant === 'primary'
                  ? styles.actionButtonTextPrimary
                  : styles.actionButtonTextSecondary,
              ]}
            >
              {btn.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      style={{ flex: 1 }}
    >
      <ScrollProvider scrollViewRef={scrollViewRef}>
        <View style={[styles.fixedHeader, { paddingTop: insets.top + spacing.md }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.subtitle}>
                {isViewingCompleted ? 'Completed Workout' : 'Active Workout'}
              </Text>
              <Text style={styles.title}>{workout?.name || 'Workout'}</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.durationPrimary}>{formattedDuration}</Text>
              {isViewingCompleted && computedVolume > 0 && (
                <Text style={styles.durationSecondary}>
                  {formatVolume(computedVolume)} {userWeightUnit}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.headerBottom}>{renderActionButtons()}</View>
        </View>
        <PageLayout
          headerType="none"
          scrollViewRef={scrollViewRef}
          screenScrollViewProps={{
            bottomInset: 400,
            topPadding: 170 + insets.top,
            horizontalPadding: spacing.md,
            showsVerticalScrollIndicator: false,
            keyboardShouldPersistTaps: 'handled',
          }}
        >
          {showFloatingPill && exercises.length > 0 && (
            <Pressable
              style={[styles.floatingPill, { bottom: insets.bottom + 92 }]}
              onPress={scrollToCurrentExercise}
            >
              <View style={styles.floatingPillContent}>
                <View style={styles.floatingPillLeft}>
                  <Text style={styles.floatingPillLabel}>
                    {exercises[currentExerciseIndex]?.name} • Set {currentSetIndex + 1}
                  </Text>
                  <Text style={styles.floatingPillSubtitle}>
                    {currentExerciseIndex + 1} of {exercises.length} exercises
                  </Text>
                </View>
                <View style={styles.floatingPillRight}>
                  <View style={styles.setCounterBadge}>
                    <Text style={styles.setCounterText}>
                      {exercises[currentExerciseIndex]?.sets.filter((s) => s.isComplete).length}/
                      {exercises[currentExerciseIndex]?.sets.length}
                    </Text>
                  </View>
                  <Text style={styles.floatingPillArrow}>↓</Text>
                </View>
              </View>
            </Pressable>
          )}

          <View style={styles.exerciseList}>
            {exercises.map((exercise, idx) => {
              const localSets = exercise.sets.map((s) => ({
                id: s.id,
                reps: s.reps ?? 0,
                weight: s.weight ?? 0,
                completed: s.isComplete,
              }));
              console.log(
                '[DEBUG workout-session] rendering exercise:',
                exercise.name,
                'at idx:',
                idx,
              );
              return (
                <View
                  key={exercise.id ?? `exercise-${idx}`}
                  onLayout={(e) => handleExerciseLayout(exercise.id, e)}
                >
                  <ExerciseLogger
                    exercise={{
                      id: exercise.id,
                      exerciseId: exercise.exerciseId,
                      name: exercise.name,
                      muscleGroup: exercise.muscleGroup,
                      isAmrap: exercise.isAmrap,
                    }}
                    sets={localSets}
                    onSetsUpdate={(sets) => handleExerciseSetsUpdate(exercise.id, sets)}
                    onAddSet={() => addSet(exercise.id)}
                    onDeleteSet={handleDeleteSet}
                    weightUnit={weightUnit}
                    isEditMode={isViewingCompleted ? isEditing : true}
                  />
                </View>
              );
            })}

            {(!isViewingCompleted || isEditing) && (
              <Pressable style={styles.addExerciseButton} onPress={() => setShowAddExercise(true)}>
                <Text style={styles.addExerciseButtonText}>+ Add Exercise</Text>
              </Pressable>
            )}

            {exercises.length > 0 && (
              <View style={styles.exerciseProgressBar}>
                <View style={styles.exerciseProgressInfo}>
                  <Text style={styles.exerciseProgressText}>
                    {exercises[currentExerciseIndex]?.name}
                  </Text>
                  <Text style={styles.exerciseProgressSubtext}>
                    {currentExerciseIndex + 1} of {exercises.length} exercises
                  </Text>
                </View>
                <View style={styles.setCounterInline}>
                  <Text style={styles.setCounterInlineText}>
                    Set {currentSetIndex + 1} of {exercises[currentExerciseIndex]?.sets.length}
                  </Text>
                </View>
              </View>
            )}
          </View>

          <Modal visible={showAddExercise} animationType="slide" presentationStyle="pageSheet">
            <ExerciseSearch
              visible={showAddExercise}
              onSelect={handleAddExercise}
              onClose={() => setShowAddExercise(false)}
              excludeIds={exercises.map((e) => e.exerciseId)}
            />
          </Modal>
        </PageLayout>
      </ScrollProvider>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontSize: typography.fontSizes.base,
  },
  errorTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    fontSize: typography.fontSizes.base,
  },
  goToWorkoutsButton: {
    backgroundColor: colors.accent,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goToWorkoutsButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  startWorkoutTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    marginBottom: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.sm,
  },
  inputLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.xs,
  },
  textInput: {
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: typography.fontSizes.lg,
  },
  errorBanner: {
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.error}50`,
    backgroundColor: `${colors.error}10`,
    padding: spacing.md,
  },
  errorBannerText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
  },
  startButton: {
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  startButtonDisabled: {
    backgroundColor: colors.border,
  },
  startButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  cancelButton: {
    height: 56,
    marginTop: spacing.sm,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.lg,
  },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
  },
  durationPrimary: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  durationSecondary: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  headerBottom: {
    marginTop: spacing.sm,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  actionButtonTextPrimary: {
    color: colors.text,
  },
  actionButtonTextSecondary: {
    color: colors.text,
  },
  floatingPill: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    backgroundColor: `${colors.surface}95`,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.accent}50`,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingPillLeft: {
    flex: 1,
  },
  floatingPillLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  floatingPillSubtitle: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
  },
  floatingPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  setCounterBadge: {
    backgroundColor: `${colors.accent}20`,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  setCounterText: {
    color: colors.accent,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  floatingPillArrow: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.lg,
  },
  exerciseList: {
    gap: spacing.sm,
  },
  addExerciseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: spacing.lg,
  },
  addExerciseButtonText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.lg,
  },
  exerciseProgressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  exerciseProgressInfo: {
    flex: 1,
  },
  exerciseProgressText: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  exerciseProgressSubtext: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
  },
  setCounterInline: {
    backgroundColor: `${colors.accent}20`,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  setCounterInlineText: {
    color: colors.accent,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
});

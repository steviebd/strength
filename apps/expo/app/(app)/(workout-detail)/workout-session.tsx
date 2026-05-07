import { useState, useCallback, useEffect, useRef, createRef, useMemo } from 'react';
import {
  Modal,
  ActivityIndicator,
  LayoutChangeEvent,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkoutSessionContext } from '@/context/WorkoutSessionContext';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { Button } from '@/components/ui/Button';
import { FormScrollView } from '@/components/ui/FormScrollView';
import { KeyboardFormLayout } from '@/components/ui/KeyboardFormLayout';
import { ExerciseLogger } from '@/components/workout/ExerciseLogger';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import {
  ProgressionPromptModal,
  type ProgressionExercisePreview,
} from '@/components/workout/ProgressionPromptModal';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { removePendingWorkout } from '@/lib/storage';
import {
  getLocalLastCompletedExerciseSnapshots,
  getLocalWorkout,
  type ExerciseHistorySnapshot,
} from '@/db/workouts';
import {
  buildHistorySnapshotFromSelection,
  getDefaultProgressionIncrement,
  hasProgressionHistoryData,
  type ProgressionSelection,
} from '@/lib/workout-progression';
import { resolveSetCompletionNavigation } from '@/lib/workoutSetNavigation';
import type { Workout, ExerciseLibraryItem } from '@/context/WorkoutSessionContext';
import {
  accent,
  border,
  colors,
  layout,
  overlay,
  radius,
  spacing,
  statusBg,
  typography,
} from '@/theme';
import { formatDuration, formatDistance } from '@/lib/units';

interface ExerciseLayout {
  id: string;
  y: number;
  height: number;
}

interface SetLayout {
  exerciseId: string;
  y: number;
  height: number;
}

type ScrollToSetOptions = { direction?: 'down'; offset?: number };

interface PendingSetScroll {
  setId: string;
  exerciseIndex: number;
  setIndex: number;
  options?: ScrollToSetOptions;
}

async function fetchWorkout(workoutId: string): Promise<Workout> {
  const local = await getLocalWorkout(workoutId);
  if (local && (!local.completedAt || local.syncStatus !== 'synced')) {
    return local;
  }

  try {
    return await apiFetch<Workout>(`/api/workouts/${workoutId}`);
  } catch (error) {
    if (local) return local;
    throw error;
  }
}

function getExerciseHistoryIds(exercise: ExerciseLibraryItem) {
  return Array.from(new Set([exercise.id, exercise.libraryId].filter(Boolean) as string[]));
}

async function fetchExerciseHistorySnapshot(
  exerciseId: string,
  exerciseName?: string | null,
  isAmrap?: boolean | null,
): Promise<ExerciseHistorySnapshot | null> {
  try {
    const params = new URLSearchParams();
    if (exerciseName?.trim()) {
      params.set('name', exerciseName.trim());
    }
    if (isAmrap !== undefined && isAmrap !== null) {
      params.set('isAmrap', String(isAmrap));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return await apiFetch<ExerciseHistorySnapshot | null>(
      `/api/workouts/last/${encodeURIComponent(exerciseId)}${query}`,
    );
  } catch {
    return null;
  }
}

async function resolveExerciseHistorySnapshot(
  userId: string | null,
  exercise: ExerciseLibraryItem,
) {
  const historyIds = getExerciseHistoryIds(exercise);
  if (userId) {
    try {
      const localHistory = await getLocalLastCompletedExerciseSnapshots(
        userId,
        historyIds,
        [exercise.name],
        { isAmrap: Boolean(exercise.isAmrap) },
      );
      const snapshot = localHistory.find(hasProgressionHistoryData);
      if (snapshot) return snapshot;
    } catch {
      // History lookup is best-effort.
    }
  }

  for (const exerciseId of historyIds) {
    const snapshot = await fetchExerciseHistorySnapshot(
      exerciseId,
      exercise.name,
      exercise.isAmrap,
    );
    if (hasProgressionHistoryData(snapshot)) return snapshot;
  }
  return null;
}

type PendingExerciseAdd = {
  items: Array<{
    exercise: ExerciseLibraryItem;
    historySnapshot: ExerciseHistorySnapshot;
  }>;
  remaining: ExerciseLibraryItem[];
};

const MAX_PROGRESSION_PREVIEWS = 5;

export default function WorkoutSessionScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isNarrowHeader = windowWidth < 400;
  const { workoutId, source, cycleId, cycleWorkoutId, programName } = useLocalSearchParams<{
    workoutId?: string;
    source?: string;
    cycleId?: string;
    cycleWorkoutId?: string;
    programName?: string;
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
  const [pendingExerciseAdd, setPendingExerciseAdd] = useState<PendingExerciseAdd | null>(null);
  const [workoutName, setWorkoutName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [exerciseLayouts, setExerciseLayouts] = useState<ExerciseLayout[]>([]);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [pendingSetScroll, setPendingSetScroll] = useState<PendingSetScroll | null>(null);
  const [, setShowFloatingPill] = useState(false);
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<any>(null);
  const { activeTimezone, weightUnit: userWeightUnit, distanceUnit } = useUserPreferences();

  const scrollYRef = useRef(0);
  const setRefsRef = useRef(new Map<string, React.RefObject<View | null>>());
  const setLayoutsRef = useRef(new Map<string, SetLayout>());

  const {
    data: loadedWorkout,
    isLoading: isLoadingWorkout,
    error: loadError,
  } = useQuery({
    queryKey: ['workout', workoutId],
    queryFn: () => fetchWorkout(workoutId!),
    enabled: !!workoutId && workout?.id !== workoutId,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!workoutId) return;
    let isActive = true;
    getLocalWorkout(workoutId).then((local) => {
      if (isActive && local) {
        void loadWorkout(local);
      }
    });
    return () => {
      isActive = false;
    };
  }, [workoutId, loadWorkout]);

  useEffect(() => {
    if (loadedWorkout) {
      loadWorkout({
        ...loadedWorkout,
        cycleWorkoutId: loadedWorkout.cycleWorkoutId ?? cycleWorkoutId ?? null,
        programCycleId: loadedWorkout.programCycleId ?? cycleId ?? null,
      });
    }
  }, [cycleId, cycleWorkoutId, loadedWorkout, loadWorkout]);

  const getSetRef = useCallback((setId: string) => {
    if (!setRefsRef.current.has(setId)) {
      setRefsRef.current.set(setId, createRef<View>());
    }
    return setRefsRef.current.get(setId)!;
  }, []);

  const scrollToSetNow = useCallback(
    (setId: string, options?: ScrollToSetOptions) => {
      if (!scrollViewRef.current) return false;

      if (options?.direction === 'down') {
        const targetScrollY = scrollYRef.current + (options.offset ?? 120);
        scrollViewRef.current.scrollTo({ y: targetScrollY, animated: true });
        return true;
      }

      const setLayout = setLayoutsRef.current.get(setId);
      const exerciseLayout = setLayout
        ? exerciseLayouts.find((layout) => layout.id === setLayout.exerciseId)
        : null;

      if (!setLayout || !exerciseLayout) return false;

      const targetScrollY = exerciseLayout.y + setLayout.y + spacing.md - 120;
      scrollViewRef.current.scrollTo({ y: Math.max(0, targetScrollY), animated: true });
      return true;
    },
    [exerciseLayouts],
  );

  const queueScrollToSet = useCallback((target: PendingSetScroll) => {
    setCurrentExerciseIndex(target.exerciseIndex);
    setCurrentSetIndex(target.setIndex);
    setPendingSetScroll(target);
  }, []);

  useEffect(() => {
    if (!pendingSetScroll) return;

    let animationFrame: number | null = null;
    let attempts = 0;
    const scrollWhenLayoutIsReady = () => {
      const didScroll = scrollToSetNow(pendingSetScroll.setId, pendingSetScroll.options);
      if (didScroll || attempts >= 4) {
        setPendingSetScroll(null);
        return;
      }
      attempts++;
      animationFrame = requestAnimationFrame(scrollWhenLayoutIsReady);
    };

    animationFrame = requestAnimationFrame(scrollWhenLayoutIsReady);

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [pendingSetScroll, scrollToSetNow]);

  const handleScroll = useCallback((event: any) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const KG_TO_LBS = 2.20462;

  const isViewingCompleted = !!workoutId && !!workout?.completedAt;
  const isProgramSession = source === 'program';
  const isProgramOneRMTest = source === 'program-1rm-test';
  const hasLoadedRequestedWorkout = !!workoutId && workout?.id === workoutId;

  const computedVolume = exercises.reduce((total, ex) => {
    const type = ex.exerciseType ?? 'weights';
    if (type !== 'weights' && type !== 'bodyweight' && type !== 'plyo') {
      return total;
    }
    return (
      total +
      (ex.sets ?? []).reduce((setTotal, set) => {
        if (!set.isComplete) return setTotal;
        const hasWeight = set.weight !== null && set.weight > 0;
        const hasReps = set.reps !== null && set.reps > 0;
        if (hasReps && (type === 'bodyweight' || hasWeight)) {
          const weight =
            userWeightUnit === 'lbs' ? (set.weight ?? 0) * KG_TO_LBS : (set.weight ?? 0);
          return setTotal + weight * set.reps!;
        }
        return setTotal;
      }, 0)
    );
  }, 0);

  const formatVolume = (volume: number) => {
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}k`;
    return volume.toString();
  };

  const { totalTimeSeconds, totalDistanceMeters, totalCompletedSets, hasWeightedSets } =
    useMemo(() => {
      let time = 0;
      let distance = 0;
      let sets = 0;
      let weighted = false;
      for (const ex of exercises) {
        const type = ex.exerciseType ?? 'weights';
        for (const set of ex.sets ?? []) {
          if (!set.isComplete) continue;
          sets++;
          if (type === 'weights' || type === 'bodyweight' || type === 'plyo') {
            weighted = true;
          }
          if (type === 'timed' || type === 'cardio') {
            time += set.duration ?? 0;
          }
          if (type === 'cardio' && set.distance) {
            distance += set.distance;
          }
        }
      }
      return {
        totalTimeSeconds: time,
        totalDistanceMeters: distance,
        totalCompletedSets: sets,
        hasWeightedSets: weighted,
      };
    }, [exercises]);

  const pendingExerciseProgressionPreviews = useMemo<ProgressionExercisePreview[]>(() => {
    if (!pendingExerciseAdd) return [];
    return pendingExerciseAdd.items.map(({ exercise, historySnapshot }) => ({
      exerciseId: historySnapshot.exerciseId,
      libraryId: exercise.libraryId ?? null,
      name: exercise.name,
      exerciseType: exercise.exerciseType ?? 'weights',
      isAmrap: Boolean(exercise.isAmrap),
      lastWorkoutDate: historySnapshot.workoutDate,
      sets: historySnapshot.sets.map((set, index) => ({
        setNumber: set.setNumber ?? index + 1,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        duration: set.duration,
        distance: set.distance,
        height: set.height,
      })),
    }));
  }, [pendingExerciseAdd]);

  const handleStartWorkout = useCallback(async () => {
    const name = workoutName.trim() || 'Workout';
    const workout = await startWorkout(name);
    if (workout?.id) {
      router.replace(`/workout-session?workoutId=${workout.id}`);
    }
  }, [router, startWorkout, workoutName]);

  const processExerciseAddQueue = useCallback(
    async (queue: ExerciseLibraryItem[]) => {
      if (queue.length === 0) {
        setShowAddExercise(false);
        return;
      }

      const pendingItems: PendingExerciseAdd['items'] = [];
      let remainingQueue: ExerciseLibraryItem[] = [];
      for (let index = 0; index < queue.length; index++) {
        const queuedExercise = queue[index];
        const historySnapshot = await resolveExerciseHistorySnapshot(
          session.data?.user?.id ?? null,
          queuedExercise,
        );
        if (historySnapshot) {
          pendingItems.push({ exercise: queuedExercise, historySnapshot });
          if (pendingItems.length >= MAX_PROGRESSION_PREVIEWS) {
            remainingQueue = queue.slice(index + 1);
            break;
          }
        } else {
          await addExercise(queuedExercise);
        }
      }

      if (pendingItems.length > 0) {
        setPendingExerciseAdd({ items: pendingItems, remaining: remainingQueue });
        setShowAddExercise(false);
        return;
      }
    },
    [addExercise, session.data?.user?.id],
  );

  const handleConfirmExerciseProgression = useCallback(
    async (selections: ProgressionSelection[]) => {
      if (!pendingExerciseAdd) return;
      const selectionByExerciseId = new Map(
        selections.map((selection) => [selection.exerciseId, selection]),
      );
      for (const item of pendingExerciseAdd.items) {
        const selection = selectionByExerciseId.get(item.historySnapshot.exerciseId);
        const historySnapshot = buildHistorySnapshotFromSelection(
          item.historySnapshot,
          selection,
          item.exercise.exerciseType,
        );
        await addExercise(item.exercise, {
          historySnapshot,
          ignoreHistory: historySnapshot === null,
        });
      }
      const remaining = pendingExerciseAdd.remaining;
      setPendingExerciseAdd(null);
      await processExerciseAddQueue(remaining);
    },
    [addExercise, pendingExerciseAdd, processExerciseAddQueue],
  );

  const handleSkipExerciseHistory = useCallback(async () => {
    if (!pendingExerciseAdd) return;
    for (const item of pendingExerciseAdd.items) {
      await addExercise(item.exercise, { ignoreHistory: true });
    }
    const remaining = pendingExerciseAdd.remaining;
    setPendingExerciseAdd(null);
    await processExerciseAddQueue(remaining);
  }, [addExercise, pendingExerciseAdd, processExerciseAddQueue]);

  const handleAddExercise = useCallback(
    async (exercisesList: ExerciseLibraryItem[]) => {
      const exercise = exercisesList[0];
      if (exercisesList.length === 1 && exercise?.isAmrap) {
        const hasNormalRow = exercises.some(
          (candidate) => candidate.exerciseId === exercise.id && !candidate.isAmrap,
        );
        if (!hasNormalRow) {
          Alert.alert(exercise.name, 'How do you want to add AMRAP?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Make this ${exercise.name} AMRAP only`,
              onPress: () => {
                void processExerciseAddQueue([exercise]);
              },
            },
            {
              text: `Add ${exercise.name} + ${exercise.name} AMRAP`,
              onPress: () => {
                void processExerciseAddQueue([{ ...exercise, isAmrap: false }, exercise]);
              },
            },
          ]);
          return;
        }
      }

      await processExerciseAddQueue(exercisesList);
    },
    [exercises, processExerciseAddQueue],
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
              duration: sets[idx].duration,
              distance: sets[idx].distance,
              height: sets[idx].height,
              isComplete: sets[idx].completed,
            });
          }
        });

      const isSetComplete = sets.map((s: any) => s.completed);

      const navigationTarget = resolveSetCompletionNavigation(
        exercises,
        exerciseIndex,
        sets.map((set: any, idx: number) => ({
          id: set.id ?? prevSets[idx]?.id,
          isComplete: set.completed,
        })),
      );

      if (navigationTarget?.type === 'next') {
        queueScrollToSet({
          setId: navigationTarget.setId,
          exerciseIndex: navigationTarget.exerciseIndex,
          setIndex: navigationTarget.setIndex,
        });
      } else if (navigationTarget?.type === 'final') {
        queueScrollToSet({
          setId: navigationTarget.setId,
          exerciseIndex: navigationTarget.exerciseIndex,
          setIndex: navigationTarget.setIndex,
          options: { direction: 'down', offset: 120 },
        });
      }

      const anyIncomplete = exercises.some((exercise, idx) => {
        if (idx === exerciseIndex) {
          return isSetComplete.some((completed: boolean) => !completed);
        }
        return exercise.sets.some((s) => !s.isComplete);
      });
      setShowFloatingPill(anyIncomplete);
    },
    [exercises, queueScrollToSet, updateSet],
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

  const handleSetLayout = useCallback(
    (exerciseId: string, setId: string, layout: { y: number; height: number }) => {
      setLayoutsRef.current.set(setId, { exerciseId, ...layout });
    },
    [],
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

  const scrollToExerciseIndex = useCallback(
    (exerciseIndex: number, setIndex?: number) => {
      if (setIndex !== undefined) {
        const setId = exercises[exerciseIndex]?.sets[setIndex]?.id;
        if (setId) {
          queueScrollToSet({ setId, exerciseIndex, setIndex });
          return;
        }
      }
      const layout = exerciseLayouts.find((l) => l.id === exercises[exerciseIndex]?.id);
      if (layout && scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          y: layout.y - 80,
          animated: true,
        });
        setCurrentExerciseIndex(exerciseIndex);
      }
    },
    [exerciseLayouts, exercises, queueScrollToSet],
  );

  const findFirstIncompleteSet = useCallback(() => {
    for (let i = 0; i < exercises.length; i++) {
      const type = exercises[i].exerciseType ?? 'weights';
      for (let j = 0; j < exercises[i].sets.length; j++) {
        const set = exercises[i].sets[j];
        if (set.isComplete) continue;
        if (type === 'weights' || type === 'bodyweight' || type === 'plyo') {
          if (set.weight !== null || set.reps !== null) {
            return { exerciseIndex: i, setIndex: j };
          }
        } else if (type === 'timed') {
          if (set.duration !== null) {
            return { exerciseIndex: i, setIndex: j };
          }
        } else if (type === 'cardio') {
          if (set.duration !== null || set.distance !== null) {
            return { exerciseIndex: i, setIndex: j };
          }
        }
      }
    }
    return null;
  }, [exercises]);

  const handleDiscardWorkout = useCallback(async () => {
    await discardWorkout();
    const programCycleId =
      workout?.programCycleId ?? (typeof cycleId === 'string' ? cycleId : null);
    if (isProgramSession && programCycleId) {
      queryClient.invalidateQueries({ queryKey: ['programSchedule', programCycleId] });
    }
    queryClient.invalidateQueries({ queryKey: ['activePrograms'] });
    queryClient.invalidateQueries({ queryKey: ['homeSummary'] });
    queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
  }, [cycleId, discardWorkout, isProgramSession, queryClient, workout?.programCycleId]);

  const executeCompleteWorkout = useCallback(async () => {
    await completeWorkout();
    const completedWorkoutId = workoutId ?? workout?.id;
    if (completedWorkoutId && isProgramSession) {
      await removePendingWorkout(completedWorkoutId);
    }
    if (completedWorkoutId) {
      queryClient.invalidateQueries({ queryKey: ['workout', completedWorkoutId] });
    }
    queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
    queryClient.invalidateQueries({ queryKey: ['homeSummary'] });
    queryClient.refetchQueries({ queryKey: ['homeSummary', activeTimezone] });
    if (isProgramOneRMTest && typeof cycleId === 'string') {
      const liftMaxes: Record<string, number | null> = {
        squat: null,
        bench: null,
        deadlift: null,
        ohp: null,
      };
      const nameToKey: Record<string, string> = {
        squat: 'squat',
        'bench press': 'bench',
        deadlift: 'deadlift',
        'overhead press': 'ohp',
      };
      for (const exercise of exercises) {
        const key = nameToKey[exercise.name.toLowerCase()];
        if (!key) continue;
        const maxWeight = exercise.sets
          .filter((s) => s.isComplete && s.weight !== null)
          .reduce((max, s) => Math.max(max, s.weight ?? 0), 0);
        if (maxWeight > 0) {
          liftMaxes[key] = maxWeight;
        }
      }
      const params = new URLSearchParams({ cycleId });
      if (completedWorkoutId) params.set('workoutId', completedWorkoutId);
      if (liftMaxes.squat !== null) params.set('squatMax', String(liftMaxes.squat));
      if (liftMaxes.bench !== null) params.set('benchMax', String(liftMaxes.bench));
      if (liftMaxes.deadlift !== null) params.set('deadliftMax', String(liftMaxes.deadlift));
      if (liftMaxes.ohp !== null) params.set('ohpMax', String(liftMaxes.ohp));
      router.push(`/program-1rm-test?${params.toString()}`);
      return;
    }
    router.push('/(app)/home');
  }, [
    completeWorkout,
    cycleId,
    exercises,
    isProgramOneRMTest,
    isProgramSession,
    activeTimezone,
    queryClient,
    router,
    workout?.id,
    workoutId,
  ]);

  const handleCompleteWorkout = useCallback(() => {
    const incomplete = findFirstIncompleteSet();
    if (incomplete) {
      Alert.alert(
        'Incomplete Set',
        "You have at least one set that isn't marked complete. Complete it or continue anyway.",
        [
          {
            text: 'Go to Set',
            onPress: () => scrollToExerciseIndex(incomplete.exerciseIndex, incomplete.setIndex),
          },
          { text: 'Continue', onPress: executeCompleteWorkout },
        ],
      );
    } else {
      executeCompleteWorkout();
    }
  }, [findFirstIncompleteSet, scrollToExerciseIndex, executeCompleteWorkout]);

  if (workoutId && isLoadingWorkout && !hasLoadedRequestedWorkout) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading workout...</Text>
      </View>
    );
  }

  if (workoutId && loadError && !hasLoadedRequestedWorkout) {
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
              const hasEnteredData = exercises.some((e) =>
                e.sets.some((s) => (s.weight !== null && s.weight > 0) || s.isComplete),
              );
              const doDiscard = async () => {
                await handleDiscardWorkout();
                router.push('/(app)/workouts');
              };
              if (isProgramOneRMTest && hasEnteredData) {
                Alert.alert(
                  'Discard 1RM Test?',
                  'You have entered set data. Are you sure you want to discard this 1RM test?',
                  [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: doDiscard },
                  ],
                );
                return;
              }
              await doDiscard();
            },
          },
          { label: 'Complete', variant: 'primary' as const, onPress: handleCompleteWorkout },
        ];

    return (
      <View style={styles.actionButtonsRow}>
        {buttons.map((btn, idx) => (
          <Button
            testID={`workout-action-${btn.label.toLowerCase().replace(/\s+/g, '-')}`}
            key={`workout-action:${btn.label}:${idx}`}
            label={btn.label}
            variant={btn.variant}
            onPress={btn.onPress}
            size="sm"
            fullWidth
          />
        ))}
      </View>
    );
  };

  return (
    <KeyboardFormLayout keyboardVerticalOffset={88}>
      <View
        style={[styles.fixedHeader, { paddingTop: insets.top + spacing.md }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <Text style={styles.subtitle}>
              {isProgramOneRMTest
                ? '1RM Test'
                : isViewingCompleted
                  ? 'Completed Workout'
                  : 'Active Workout'}
            </Text>
            <Text
              style={[styles.title, isProgramOneRMTest && isNarrowHeader && styles.titleNarrow]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {isProgramOneRMTest && programName ? programName : workout?.name || 'Workout'}
            </Text>
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
        {isViewingCompleted && (
          <View style={styles.summaryPills}>
            {hasWeightedSets && computedVolume > 0 && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {formatVolume(computedVolume)} {userWeightUnit}
                </Text>
              </View>
            )}
            {totalTimeSeconds > 0 && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{formatDuration(totalTimeSeconds)}</Text>
              </View>
            )}
            {totalDistanceMeters > 0 && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {formatDistance(totalDistanceMeters, distanceUnit)}
                </Text>
              </View>
            )}
            {totalCompletedSets > 0 && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{totalCompletedSets} sets</Text>
              </View>
            )}
          </View>
        )}
        <View style={styles.headerBottom}>{renderActionButtons()}</View>
      </View>
      <FormScrollView
        ref={scrollViewRef}
        bottomInset={layout.bottomInsetList}
        topPadding={headerHeight + spacing.md}
        horizontalPadding={spacing.md}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.exerciseList}>
          {exercises.map((exercise, idx) => {
            const localSets = (exercise.sets ?? []).map((s) => ({
              id: s.id,
              reps: s.reps ?? 0,
              weight: s.weight ?? null,
              duration: s.duration ?? 0,
              distance: s.distance ?? null,
              height: s.height ?? 0,
              completed: s.isComplete,
            }));
            return (
              <View
                key={`workout-exercise:${exercise.id ?? idx}`}
                onLayout={(e) => handleExerciseLayout(exercise.id, e)}
              >
                <ExerciseLogger
                  exercise={{
                    id: exercise.id,
                    exerciseId: exercise.exerciseId,
                    name: exercise.name,
                    muscleGroup: exercise.muscleGroup,
                    exerciseType: exercise.exerciseType,
                    isAmrap: exercise.isAmrap,
                  }}
                  sets={localSets}
                  onSetsUpdate={(sets) => handleExerciseSetsUpdate(exercise.id, sets)}
                  onAddSet={() => addSet(exercise.id)}
                  onDeleteSet={handleDeleteSet}
                  weightUnit={weightUnit}
                  isEditMode={isViewingCompleted ? isEditing : true}
                  getSetRef={getSetRef}
                  onSetLayout={(setId, layout) => handleSetLayout(exercise.id, setId, layout)}
                />
              </View>
            );
          })}

          {(!isViewingCompleted || isEditing) && (
            <Pressable
              testID="workout-add-exercise"
              accessibilityLabel="workout-add-exercise"
              style={styles.addExerciseButton}
              onPress={() => setShowAddExercise(true)}
            >
              <Text style={styles.addExerciseButtonText}>+ Add Exercise</Text>
            </Pressable>
          )}

          {exercises.length > 0 && (
            <Pressable style={styles.exerciseProgressBar} onPress={scrollToCurrentExercise}>
              <View style={styles.exerciseProgressInfo}>
                <Text style={styles.exerciseProgressText}>
                  {exercises[currentExerciseIndex]?.name}
                  {exercises[currentExerciseIndex]?.isAmrap ? ' (AMRAP)' : ''}
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
            </Pressable>
          )}
        </View>

        <Modal visible={showAddExercise} animationType="slide" presentationStyle="pageSheet">
          <ExerciseSearch
            visible={showAddExercise}
            onSelect={handleAddExercise}
            onClose={() => setShowAddExercise(false)}
          />
        </Modal>

        <ProgressionPromptModal
          visible={pendingExerciseAdd !== null}
          title="Progress from last workout"
          subtitle={
            pendingExerciseAdd
              ? `${pendingExerciseAdd.items.length} exercise${pendingExerciseAdd.items.length === 1 ? '' : 's'} have previous set data. Choose how to add them.`
              : undefined
          }
          weightUnit={weightUnit}
          defaultIncrement={getDefaultProgressionIncrement(weightUnit)}
          exercises={pendingExerciseProgressionPreviews}
          allowPerExerciseEdit={false}
          onConfirm={(selections) => {
            void handleConfirmExerciseProgression(selections);
          }}
          onSkipHistory={() => {
            void handleSkipExerciseHistory();
          }}
          onClose={() => setPendingExerciseAdd(null)}
        />
      </FormScrollView>
    </KeyboardFormLayout>
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
    borderColor: statusBg.errorBorder,
    backgroundColor: statusBg.error,
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
    overflow: 'hidden',
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
  titleNarrow: {
    fontSize: typography.fontSizes.lg,
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
    overflow: 'hidden',
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
    backgroundColor: overlay.muted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: border.focus,
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
    backgroundColor: accent.subtle,
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
    backgroundColor: accent.subtle,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  setCounterInlineText: {
    color: colors.accent,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  summaryPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pill: {
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
  },
});

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  LayoutChangeEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkoutSessionContext } from '@/context/WorkoutSessionContext';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { ExerciseLogger } from '@/components/workout/ExerciseLogger';
import { ExerciseSearch } from '@/components/workout/ExerciseSearch';
import { apiFetch } from '@/lib/api';
import { removePendingWorkout } from '@/lib/storage';
import type { Workout } from '@/context/WorkoutSessionContext';
import { ScrollProvider } from '@/context/ScrollContext';

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
  const scrollViewRef = useRef<ScrollView>(null);
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
    async (exercise: ExerciseLibraryItem) => {
      await addExercise(exercise);
    },
    [addExercise],
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
      <View className="flex-1 bg-darkBg items-center justify-center">
        <ActivityIndicator size="large" color="#F97066" />
        <Text className="text-darkMuted mt-4">Loading workout...</Text>
      </View>
    );
  }

  if (workoutId && loadError) {
    return (
      <View className="flex-1 bg-darkBg items-center justify-center px-6">
        <Text className="text-darkText text-xl font-bold mb-2">Error Loading Workout</Text>
        <Text className="text-darkMuted text-center mb-6">
          {loadError?.message || 'Failed to load workout'}
        </Text>
        <Pressable
          className="h-12 items-center justify-center rounded-xl bg-pine px-8"
          onPress={() => router.push('/(app)/workouts')}
        >
          <Text className="text-white font-semibold">Go to Workouts</Text>
        </Pressable>
      </View>
    );
  }

  if (!isActive && !workout && !workoutId) {
    return (
      <View className="flex-1 bg-darkBg px-6 pt-16">
        <Text className="text-darkText mb-6 text-2xl font-bold">Start Workout</Text>

        <View className="mb-4">
          <Text className="text-darkMuted mb-2 text-sm">Workout Name</Text>
          <TextInput
            className="h-14 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText text-lg"
            placeholder="e.g., Upper Body Day"
            placeholderTextColor="#71717a"
            value={workoutName}
            onChangeText={setWorkoutName}
          />
        </View>

        {error && (
          <View className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 p-4">
            <Text className="text-red-500 text-sm">{error}</Text>
          </View>
        )}

        <Pressable
          className={`h-14 items-center justify-center rounded-2xl ${
            isLoading ? 'bg-darkBorder' : 'bg-coral'
          }`}
          onPress={handleStartWorkout}
          disabled={isLoading}
        >
          <Text className="text-white text-lg font-semibold">
            {isLoading ? 'Starting...' : 'Start Workout'}
          </Text>
        </Pressable>

        <Pressable
          className="mt-4 h-14 items-center justify-center rounded-2xl border border-darkBorder"
          onPress={() => router.back()}
        >
          <Text className="text-darkMuted text-lg">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      style={{ flex: 1 }}
    >
      <ScrollProvider scrollViewRef={scrollViewRef}>
        <View className="flex-1 bg-darkBg">
          <View className="border-b border-darkBorder px-6 py-4">
            <View className="flex flex-row items-center justify-between">
              <View className="flex-1 min-w-0">
                <Text className="text-darkMuted text-xs uppercase tracking-wider">
                  {isViewingCompleted ? 'Completed Workout' : 'Active Workout'}
                </Text>
                <Text className="text-darkText text-xl font-bold truncate">
                  {workout?.name || 'Workout'}
                </Text>
              </View>
              <View className="flex flex-col items-end">
                <Text className="text-coral text-2xl font-bold">{formattedDuration}</Text>
                {isViewingCompleted && computedVolume > 0 && (
                  <Text className="text-darkMuted text-sm">
                    {formatVolume(computedVolume)} {userWeightUnit}
                  </Text>
                )}
              </View>
            </View>

            <View className="mt-4 flex flex-row gap-2">
              {isViewingCompleted ? (
                <>
                  <Pressable
                    className="flex-1 h-12 items-center justify-center rounded-xl border border-darkBorder bg-darkCard"
                    onPress={() => setIsEditing(!isEditing)}
                  >
                    <Text className="text-darkMuted font-semibold">
                      {isEditing ? 'Cancel Edit' : 'Edit'}
                    </Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 h-12 items-center justify-center rounded-xl bg-pine"
                    onPress={() =>
                      router.push(isProgramSession ? '/(app)/programs' : '/(app)/workouts')
                    }
                  >
                    <Text className="text-white font-semibold">Close</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    className="flex-1 h-12 items-center justify-center rounded-xl border border-darkBorder bg-darkCard"
                    onPress={async () => {
                      await discardWorkout();
                      if (isProgramOneRMTest && typeof cycleId === 'string') {
                        router.push(`/program-1rm-test?cycleId=${cycleId}`);
                        return;
                      }
                      router.push('/(app)/workouts');
                    }}
                  >
                    <Text className="text-darkMuted font-semibold">Discard</Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 h-12 items-center justify-center rounded-xl bg-pine"
                    onPress={handleCompleteWorkout}
                  >
                    <Text className="text-white font-semibold">Complete</Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>

          {showFloatingPill && exercises.length > 0 && (
            <Pressable
              className="absolute bottom-24 left-4 right-4 rounded-2xl border border-coral/50 bg-darkCard/95 px-4 py-3 shadow-lg"
              onPress={scrollToCurrentExercise}
              style={{ bottom: 100 }}
            >
              <View className="flex flex-row items-center justify-between">
                <View className="flex flex-col">
                  <Text className="text-darkMuted text-xs">
                    {exercises[currentExerciseIndex]?.name} • Set {currentSetIndex + 1}
                  </Text>
                  <Text className="text-darkText text-sm">
                    {currentExerciseIndex + 1} of {exercises.length} exercises
                  </Text>
                </View>
                <View className="flex flex-row items-center gap-2">
                  <View className="rounded-full bg-coral/20 px-3 py-1">
                    <Text className="text-coral text-sm font-bold">
                      {exercises[currentExerciseIndex]?.sets.filter((s) => s.isComplete).length}/
                      {exercises[currentExerciseIndex]?.sets.length}
                    </Text>
                  </View>
                  <Text className="text-darkMuted">↓</Text>
                </View>
              </View>
            </Pressable>
          )}

          <ScrollView
            ref={scrollViewRef}
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 600 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="p-4 space-y-3">
              {exercises.map((exercise, _index) => {
                const localSets = exercise.sets.map((s) => ({
                  id: s.id,
                  reps: s.reps ?? 0,
                  weight: s.weight ?? 0,
                  completed: s.isComplete,
                }));
                return (
                  <View key={exercise.id} onLayout={(e) => handleExerciseLayout(exercise.id, e)}>
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
                <Pressable
                  className="flex flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-darkBorder py-6"
                  onPress={() => setShowAddExercise(true)}
                >
                  <Text className="text-darkMuted text-lg">+ Add Exercise</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>

          <Modal visible={showAddExercise} animationType="slide" presentationStyle="pageSheet">
            <ExerciseSearch
              visible={showAddExercise}
              onSelect={handleAddExercise}
              onClose={() => setShowAddExercise(false)}
              excludeIds={exercises.map((e) => e.exerciseId)}
            />
          </Modal>
        </View>
      </ScrollProvider>
    </KeyboardAvoidingView>
  );
}

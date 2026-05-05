import { useState, useCallback, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { removePendingWorkout } from '@/lib/storage';
import { getLastWorkout, setLastWorkout } from '@/db/last-workouts';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { generateId, WORKOUT_TYPE_ONE_RM_TEST } from '@strength/db/client';
import { exerciseLibrary } from '@strength/db/client';
import {
  completeLocalWorkout,
  createLocalWorkout,
  discardLocalWorkout,
  getLocalLastCompletedExerciseSnapshots,
  getLocalWorkout,
  markLocalCycleWorkoutComplete,
  saveLocalWorkoutDraft,
  type ExerciseHistorySnapshot,
} from '@/db/workouts';
import { enqueueWorkoutCompletion } from '@/db/sync-queue';
import { runWorkoutSync } from '@/lib/workout-sync';
import type {
  Workout,
  WorkoutExercise,
  WorkoutSet,
  Exercise,
} from '@/context/WorkoutSessionContext';

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function generateLocalId(): string {
  return generateId();
}

async function fetchExerciseHistorySnapshot(
  exerciseId: string,
  exerciseName?: string | null,
): Promise<ExerciseHistorySnapshot | null> {
  try {
    const params = exerciseName?.trim() ? `?name=${encodeURIComponent(exerciseName.trim())}` : '';
    return await apiFetch<ExerciseHistorySnapshot | null>(
      `/api/workouts/last/${encodeURIComponent(exerciseId)}${params}`,
    );
  } catch {
    return null;
  }
}

function getExerciseHistoryIds(exercise: Exercise) {
  return Array.from(new Set([exercise.id, exercise.libraryId].filter(Boolean) as string[]));
}

function hasUsableHistory(snapshot: ExerciseHistorySnapshot | null | undefined) {
  return snapshot?.sets?.some((set) => set.weight !== null || set.reps !== null) ?? false;
}

async function fetchFirstExerciseHistorySnapshot(exerciseIds: string[], exerciseName: string) {
  for (const exerciseId of exerciseIds) {
    const snapshot = await fetchExerciseHistorySnapshot(exerciseId, exerciseName);
    if (hasUsableHistory(snapshot)) {
      return snapshot;
    }
  }
  return null;
}

async function getCachedLastWorkoutData(userId: string, exerciseIds: string[]) {
  for (const exerciseId of exerciseIds) {
    const cached = await getLastWorkout(userId, exerciseId);
    if (cached && (cached.weight !== null || cached.reps !== null)) {
      return cached;
    }
  }
  return null;
}

function buildDirectCompletionPayload(workout: Workout, exercises: WorkoutExercise[]) {
  const completedAt = new Date();
  return {
    syncOperationId: generateId(),
    workout: {
      id: workout.id,
      name: workout.name,
      templateId: workout.templateId ?? null,
      programCycleId: workout.programCycleId ?? null,
      cycleWorkoutId: workout.cycleWorkoutId ?? null,
      workoutType: workout.workoutType ?? null,
      startedAt: workout.startedAt,
      completedAt: completedAt.toISOString(),
      notes: workout.notes ?? null,
      durationMinutes: workout.durationMinutes ?? null,
    },
    exercises: exercises.map((exercise, exerciseIndex) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      libraryId: exercise.libraryId ?? null,
      orderIndex: exerciseIndex,
      notes: exercise.notes,
      isAmrap: exercise.isAmrap,
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
    })),
    sets: exercises.flatMap((exercise) =>
      (exercise.sets ?? []).map((set, setIndex) => ({
        id: set.id,
        workoutExerciseId: exercise.id,
        setNumber: setIndex + 1,
        weight: set.weight,
        reps: set.reps,
        rpe: set.rpe,
        isComplete: set.isComplete,
        completedAt: set.isComplete ? (set.completedAt ?? completedAt.toISOString()) : null,
      })),
    ),
  };
}

function buildHistorySets(historySnapshot: ExerciseHistorySnapshot): WorkoutSet[] {
  return historySnapshot.sets.map((set, index) => ({
    id: generateLocalId(),
    workoutExerciseId: '',
    setNumber: set.setNumber ?? index + 1,
    weight: set.weight,
    reps: set.reps,
    rpe: set.rpe ?? null,
    isComplete: false,
    completedAt: null,
    createdAt: new Date().toISOString(),
  }));
}

function buildCachedSet(cached: {
  weight: number | null;
  reps: number | null;
  rpe?: number | null;
}) {
  return [
    {
      id: generateLocalId(),
      workoutExerciseId: '',
      setNumber: 1,
      weight: cached.weight,
      reps: cached.reps,
      rpe: cached.rpe ?? null,
      isComplete: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildEmptySet() {
  return [
    {
      id: generateLocalId(),
      workoutExerciseId: '',
      setNumber: 1,
      weight: null,
      reps: null,
      rpe: null,
      isComplete: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
    },
  ];
}

function normalizeWorkoutExercises(exercises: WorkoutExercise[] | null | undefined) {
  return (exercises ?? []).map((exercise) => ({
    ...exercise,
    sets: exercise.sets ?? [],
  }));
}

interface UseWorkoutSessionReturn {
  workout: Workout | null;
  exercises: WorkoutExercise[];
  isLoading: boolean;
  error: string | null;
  duration: number;
  formattedDuration: string;
  isActive: boolean;
  weightUnit: 'kg' | 'lbs';
  startWorkout: (name: string) => Promise<Workout | null>;
  loadWorkout: (workoutOrId: string | Workout) => Promise<void>;
  completeWorkout: () => Promise<void>;
  discardWorkout: () => Promise<void>;
  addExercise: (exercise: Exercise) => Promise<void>;
  updateExercise: (workoutExerciseId: string, updates: Partial<WorkoutExercise>) => void;
  removeExercise: (workoutExerciseId: string) => void;
  addSet: (workoutExerciseId: string) => void;
  updateSet: (setId: string, updates: Partial<WorkoutSet>) => void;
  deleteSet: (setId: string) => void;
  toggleSetComplete: (setId: string) => void;
  getLastWorkoutData: (exerciseId: string) => { weight: number; reps: number } | null;
  availableExercises: Exercise[];
}

function logDuplicateWorkoutIds(exercises: WorkoutExercise[]) {
  if (!__DEV__) {
    return;
  }

  const exerciseIds = new Set<string>();
  const duplicateExerciseIds = new Set<string>();
  const setIds = new Set<string>();
  const duplicateSetIds = new Set<string>();

  for (const exercise of exercises) {
    if (exerciseIds.has(exercise.id)) {
      duplicateExerciseIds.add(exercise.id);
    } else {
      exerciseIds.add(exercise.id);
    }

    for (const set of exercise.sets ?? []) {
      if (setIds.has(set.id)) {
        duplicateSetIds.add(set.id);
      } else {
        setIds.add(set.id);
      }
    }
  }

  if (duplicateExerciseIds.size === 0 && duplicateSetIds.size === 0) {
    return;
  }
}

export function useWorkoutSession(): UseWorkoutSessionReturn {
  const session = authClient.useSession();
  const { weightUnit } = useUserPreferences();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date | null>(null);
  const exercisesRef = useRef<WorkoutExercise[]>([]);
  const lastWorkoutDataRef = useRef<Map<string, { weight: number; reps: number }[]>>(new Map());
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setExercisesAndRef = useCallback(
    (value: WorkoutExercise[] | ((current: WorkoutExercise[]) => WorkoutExercise[])) => {
      const next = typeof value === 'function' ? value(exercisesRef.current) : value;
      exercisesRef.current = next;
      setExercises(next);
      return next;
    },
    [],
  );

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (workout && !workout.completedAt) {
      startTimeRef.current = new Date(workout.startedAt);
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
          setDuration(elapsed);
        }
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [workout?.id]);

  useEffect(() => {
    logDuplicateWorkoutIds(exercises);
  }, [exercises]);

  useEffect(() => {
    if (!workout || workout.completedAt || !session.data?.user) return;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }
    const userId = session.data.user.id;
    draftSaveTimerRef.current = setTimeout(() => {
      void saveLocalWorkoutDraft(userId, workout, exercises);
    }, 400);
    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [workout, exercises, session.data?.user]);

  const startWorkout = useCallback(
    async (name: string) => {
      if (!session.data?.user) return null;
      setIsLoading(true);
      setError(null);
      try {
        const local = await createLocalWorkout(session.data.user.id, { name });
        if (!local) {
          setError('Failed to create workout locally. Please try again.');
          return null;
        }
        setWorkout(local);
        setExercisesAndRef([]);
        setDuration(0);
        startTimeRef.current = new Date();
        timerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
        return local;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start workout');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [session.data?.user, setExercisesAndRef],
  );

  const loadWorkout = useCallback(
    async (workoutOrId: string | Workout) => {
      if (!session.data?.user) return;
      setIsLoading(true);
      setError(null);
      try {
        let workoutData: Workout;
        if (typeof workoutOrId === 'string') {
          const local = await getLocalWorkout(workoutOrId);
          if (local) {
            workoutData = local;
          } else {
            workoutData = await apiFetch<Workout>(`/api/workouts/${workoutOrId}`);
          }
        } else {
          workoutData = workoutOrId;
        }
        const normalizedExercises = normalizeWorkoutExercises(workoutData.exercises);
        setWorkout({ ...workoutData, exercises: normalizedExercises });
        setExercisesAndRef(normalizedExercises);
        if (workoutData.startedAt && !workoutData.completedAt) {
          startTimeRef.current = new Date(workoutData.startedAt);
          timerRef.current = setInterval(() => {
            if (startTimeRef.current) {
              const elapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
              setDuration(elapsed);
            }
          }, 1000);
        } else if (workoutData.completedAt && workoutData.durationMinutes) {
          setDuration(workoutData.durationMinutes * 60);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load workout');
      } finally {
        setIsLoading(false);
      }
    },
    [session.data?.user, setExercisesAndRef],
  );

  const completeWorkout = useCallback(async () => {
    if (!workout || !session.data?.user) return;
    setIsLoading(true);
    try {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
      const latestExercises = exercisesRef.current;
      await saveLocalWorkoutDraft(session.data.user.id, workout, latestExercises);
      const completed = await completeLocalWorkout(session.data.user.id, workout, latestExercises);
      if (completed?.workout) {
        await enqueueWorkoutCompletion(session.data.user.id, workout.id, completed.workout);
        await runWorkoutSync(session.data.user.id);
      } else {
        const payload = buildDirectCompletionPayload(workout, latestExercises);
        await apiFetch(`/api/workouts/${workout.id}/sync-complete`, {
          method: 'POST',
          body: payload,
        });
      }
      if ((workout as any).cycleWorkoutId) {
        await markLocalCycleWorkoutComplete((workout as any).cycleWorkoutId, workout.id);
      }
      if (session.data?.user && workout.workoutType !== WORKOUT_TYPE_ONE_RM_TEST) {
        const userId = session.data.user.id;
        for (const exercise of latestExercises) {
          const completedSets = (exercise.sets ?? []).filter((s) => s.isComplete);
          if (completedSets.length > 0) {
            const lastSet = completedSets[completedSets.length - 1];
            if (lastSet.weight !== null || lastSet.reps !== null) {
              const lastWorkout = {
                weight: lastSet.weight,
                reps: lastSet.reps,
                rpe: lastSet.rpe,
                date: new Date().toISOString(),
              };
              await setLastWorkout(userId, exercise.exerciseId, lastWorkout);
              if (exercise.libraryId) {
                await setLastWorkout(userId, exercise.libraryId, lastWorkout);
              }
            }
          }
        }
      }
      setWorkout((prev) => (prev ? { ...prev, completedAt: new Date().toISOString() } : null));
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete workout');
    } finally {
      setIsLoading(false);
    }
  }, [workout, session.data?.user]);

  const discardWorkout = useCallback(async () => {
    if (workout?.id) {
      try {
        const userId = session.data?.user?.id;
        if (!userId) return;
        if (draftSaveTimerRef.current) {
          clearTimeout(draftSaveTimerRef.current);
          draftSaveTimerRef.current = null;
        }
        await discardLocalWorkout(workout.id, workout.cycleWorkoutId);
        await removePendingWorkout(workout.id);
      } catch {
        // no-op
      }
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setWorkout(null);
    setExercisesAndRef([]);
    setDuration(0);
    setError(null);
  }, [setExercisesAndRef, workout]);

  const addExercise = useCallback(
    async (exercise: Exercise) => {
      const historyIds = getExerciseHistoryIds(exercise);
      let historySnapshot: ExerciseHistorySnapshot | null = null;
      let cached: Awaited<ReturnType<typeof getCachedLastWorkoutData>> = null;

      if (session.data?.user?.id) {
        try {
          const localHistory = await getLocalLastCompletedExerciseSnapshots(
            session.data.user.id,
            historyIds,
            [exercise.name],
          );
          historySnapshot = localHistory.find(hasUsableHistory) ?? null;
        } catch {
          // History lookup is best-effort. The exercise should still be added.
        }
      }

      if (historySnapshot === null && cached === null) {
        historySnapshot = await fetchFirstExerciseHistorySnapshot(historyIds, exercise.name);
      }

      if (historySnapshot === null && session.data?.user?.id) {
        cached = await getCachedLastWorkoutData(session.data.user.id, historyIds);
      }

      const newSets: WorkoutSet[] =
        historySnapshot !== null
          ? buildHistorySets(historySnapshot)
          : cached
            ? buildCachedSet(cached)
            : buildEmptySet();

      const newWorkoutExercise: WorkoutExercise = {
        id: generateLocalId(),
        exerciseId: exercise.id,
        libraryId: exercise.libraryId ?? null,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        orderIndex: exercisesRef.current.length,
        sets: newSets,
        notes: null,
        isAmrap: exercise.isAmrap ?? false,
      };
      setExercisesAndRef((prev) => {
        const next = [...prev, newWorkoutExercise];
        return next;
      });
    },
    [session.data?.user?.id, setExercisesAndRef],
  );

  const updateExercise = useCallback(
    (workoutExerciseId: string, updates: Partial<WorkoutExercise>) => {
      setExercisesAndRef((prev) =>
        prev.map((ex) => (ex.id === workoutExerciseId ? { ...ex, ...updates } : ex)),
      );
    },
    [setExercisesAndRef],
  );

  const removeExercise = useCallback(
    (workoutExerciseId: string) => {
      setExercisesAndRef((prev) => prev.filter((ex) => ex.id !== workoutExerciseId));
    },
    [setExercisesAndRef],
  );

  const addSet = useCallback(
    (workoutExerciseId: string) => {
      setExercisesAndRef((prev) =>
        prev.map((ex) => {
          if (ex.id !== workoutExerciseId) return ex;
          const sets = ex.sets ?? [];
          const lastSet = sets[sets.length - 1];
          const newSet: WorkoutSet = {
            id: generateLocalId(),
            workoutExerciseId,
            setNumber: sets.length + 1,
            weight: lastSet?.weight ?? null,
            reps: lastSet?.reps ?? null,
            rpe: null,
            isComplete: false,
            completedAt: null,
            createdAt: new Date().toISOString(),
          };
          return { ...ex, sets: [...sets, newSet] };
        }),
      );
    },
    [setExercisesAndRef],
  );

  const updateSet = useCallback(
    (setId: string, updates: Partial<WorkoutSet>) => {
      setExercisesAndRef((prev) =>
        prev.map((ex) => ({
          ...ex,
          sets: (ex.sets ?? []).map((s) => {
            if (s.id !== setId) return s;
            const next = { ...s, ...updates };
            if ('isComplete' in updates && !('completedAt' in updates)) {
              next.completedAt = updates.isComplete
                ? (s.completedAt ?? new Date().toISOString())
                : null;
            }
            return next;
          }),
        })),
      );
    },
    [setExercisesAndRef],
  );

  const deleteSet = useCallback(
    (setId: string) => {
      setExercisesAndRef((prev) =>
        prev.map((ex) => ({
          ...ex,
          sets: (ex.sets ?? [])
            .filter((s) => s.id !== setId)
            .map((s, idx) => ({ ...s, setNumber: idx + 1 })),
        })),
      );
    },
    [setExercisesAndRef],
  );

  const toggleSetComplete = useCallback(
    (setId: string) => {
      let isComplete = false;
      setExercisesAndRef((prev) =>
        prev.map((ex) => ({
          ...ex,
          sets: (ex.sets ?? []).map((s) => {
            if (s.id === setId) {
              isComplete = !s.isComplete;
              return {
                ...s,
                isComplete,
                completedAt: !s.isComplete ? new Date().toISOString() : null,
              };
            }
            return s;
          }),
        })),
      );
    },
    [setExercisesAndRef],
  );

  const getLastWorkoutData = useCallback(
    (exerciseId: string): { weight: number; reps: number } | null => {
      const data = lastWorkoutDataRef.current.get(exerciseId);
      if (!data || data.length === 0) return null;
      const last = data[data.length - 1];
      return { weight: last.weight, reps: last.reps };
    },
    [],
  );

  return {
    workout,
    exercises,
    isLoading,
    error,
    duration,
    formattedDuration: formatDuration(duration),
    isActive: workout !== null && !workout.completedAt,
    weightUnit,
    startWorkout,
    loadWorkout,
    completeWorkout,
    discardWorkout,
    addExercise,
    updateExercise,
    removeExercise,
    addSet,
    updateSet,
    deleteSet,
    toggleSetComplete,
    getLastWorkoutData,
    availableExercises: exerciseLibrary.map((item) => ({
      id: item.id,
      libraryId: item.id,
      name: item.name,
      muscleGroup: item.muscleGroup,
      description: item.description,
    })),
  };
}

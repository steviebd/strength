import { useState, useCallback, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { getLastWorkout, setLastWorkout, removePendingWorkout } from '@/lib/storage';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { generateId } from '@strength/db';
import { exerciseLibrary } from '@strength/db';
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
  return `local-${generateId()}`;
}

function isServerId(id: string | null | undefined): boolean {
  return (
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );
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

    for (const set of exercise.sets) {
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
  const lastWorkoutDataRef = useRef<Map<string, { weight: number; reps: number }[]>>(new Map());

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

  const startWorkout = useCallback(
    async (name: string) => {
      if (!session.data?.user) return null;
      setIsLoading(true);
      setError(null);
      try {
        const workoutData = await apiFetch<Workout>('/api/workouts', {
          method: 'POST',
          body: { name },
        });
        setWorkout(workoutData);
        setExercises([]);
        setDuration(0);
        startTimeRef.current = new Date();
        timerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
        return workoutData;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start workout');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [session.data?.user],
  );

  const loadWorkout = useCallback(
    async (workoutOrId: string | Workout) => {
      if (!session.data?.user) return;
      setIsLoading(true);
      setError(null);
      try {
        let workoutData: Workout;
        if (typeof workoutOrId === 'string') {
          workoutData = await apiFetch<Workout>(`/api/workouts/${workoutOrId}`);
        } else {
          workoutData = workoutOrId;
        }
        setWorkout(workoutData);
        setExercises(workoutData.exercises || []);
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
    [session.data?.user],
  );

  const completeWorkout = useCallback(async () => {
    if (!workout) return;
    setIsLoading(true);
    try {
      const existingExercises = await apiFetch<Workout>(`/api/workouts/${workout.id}`);
      const existingExerciseMap = new Map(
        (existingExercises.exercises || []).map((ex) => [ex.exerciseId, ex]),
      );

      for (let i = 0; i < exercises.length; i++) {
        const exercise = exercises[i];
        const existingWorkoutExercise = existingExerciseMap.get(exercise.exerciseId);

        if (existingWorkoutExercise) {
          for (let j = 0; j < exercise.sets.length; j++) {
            const set = exercise.sets[j];
            if (isServerId(set.id)) {
              await apiFetch(`/api/workouts/sets/${set.id}`, {
                method: 'PUT',
                body: {
                  weight: set.weight,
                  reps: set.reps,
                  rpe: set.rpe,
                  isComplete: set.isComplete,
                },
              });
            } else {
              await apiFetch('/api/workouts/sets', {
                method: 'POST',
                body: {
                  workoutExerciseId: existingWorkoutExercise.id,
                  setNumber: j + 1,
                  weight: set.weight,
                  reps: set.reps,
                  rpe: set.rpe,
                  isComplete: set.isComplete,
                },
              });
            }
          }
        } else {
          const workoutExercise = await apiFetch<{ id: string }>(
            `/api/workouts/${workout.id}/exercises`,
            {
              method: 'POST',
              body: {
                exerciseId: exercise.exerciseId,
                orderIndex: i,
              },
            },
          );

          for (let j = 0; j < exercise.sets.length; j++) {
            const set = exercise.sets[j];
            await apiFetch('/api/workouts/sets', {
              method: 'POST',
              body: {
                workoutExerciseId: workoutExercise.id,
                setNumber: j + 1,
                weight: set.weight,
                reps: set.reps,
                rpe: set.rpe,
                isComplete: set.isComplete,
              },
            });
          }
        }
      }

      await apiFetch(`/api/workouts/${workout.id}/complete`, {
        method: 'PUT',
        body: {},
      });
      for (const exercise of exercises) {
        const completedSets = exercise.sets.filter((s) => s.isComplete);
        if (completedSets.length > 0) {
          const lastSet = completedSets[completedSets.length - 1];
          if (lastSet.weight !== null || lastSet.reps !== null) {
            await setLastWorkout(exercise.exerciseId, {
              weight: lastSet.weight,
              reps: lastSet.reps,
              rpe: lastSet.rpe,
              date: new Date().toISOString(),
            });
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
  }, [workout, exercises]);

  const discardWorkout = useCallback(async () => {
    if (workout?.id) {
      try {
        await apiFetch(`/api/workouts/${workout.id}`, { method: 'DELETE' });
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
    setExercises([]);
    setDuration(0);
    setError(null);
  }, [workout]);

  const addExercise = useCallback(
    async (exercise: Exercise) => {
      try {
        const cached = await getLastWorkout(exercise.id);

        const newSets: WorkoutSet[] =
          cached && cached.weight !== null && cached.reps !== null
            ? [
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
              ]
            : [
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

        const newWorkoutExercise: WorkoutExercise = {
          id: generateLocalId(),
          exerciseId: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          orderIndex: exercises.length,
          sets: newSets,
          notes: null,
          isAmrap: exercise.name.endsWith('3+') || exercise.name.toLowerCase().includes('amrap'),
        };
        setExercises((prev) => {
          const next = [...prev, newWorkoutExercise];
          return next;
        });
      } catch {
        // no-op
      }
    },
    [exercises.length],
  );

  const updateExercise = useCallback(
    (workoutExerciseId: string, updates: Partial<WorkoutExercise>) => {
      setExercises((prev) =>
        prev.map((ex) => (ex.id === workoutExerciseId ? { ...ex, ...updates } : ex)),
      );
    },
    [],
  );

  const removeExercise = useCallback((workoutExerciseId: string) => {
    setExercises((prev) => prev.filter((ex) => ex.id !== workoutExerciseId));
  }, []);

  const addSet = useCallback((workoutExerciseId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== workoutExerciseId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const newSet: WorkoutSet = {
          id: generateLocalId(),
          workoutExerciseId,
          setNumber: ex.sets.length + 1,
          weight: lastSet?.weight ?? null,
          reps: lastSet?.reps ?? null,
          rpe: null,
          isComplete: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      }),
    );
  }, []);

  const updateSet = useCallback(
    (setId: string, updates: Partial<WorkoutSet>) => {
      setExercises((prev) =>
        prev.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...updates } : s)),
        })),
      );
      const set = exercises.flatMap((ex) => ex.sets).find((s) => s.id === setId);
      if (isServerId(set?.id)) {
        apiFetch(`/api/workouts/sets/${setId}`, {
          method: 'PUT',
          body: updates,
        }).catch(() => {});
      }
    },
    [exercises],
  );

  const deleteSet = useCallback((setId: string) => {
    setExercises((prev) =>
      prev.map((ex) => ({
        ...ex,
        sets: ex.sets.filter((s) => s.id !== setId).map((s, idx) => ({ ...s, setNumber: idx + 1 })),
      })),
    );
  }, []);

  const toggleSetComplete = useCallback(
    (setId: string) => {
      let isComplete = false;
      setExercises((prev) =>
        prev.map((ex) => ({
          ...ex,
          sets: ex.sets.map((s) => {
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
      const set = exercises.flatMap((ex) => ex.sets).find((s) => s.id === setId);
      if (isServerId(set?.id)) {
        apiFetch(`/api/workouts/sets/${setId}`, {
          method: 'PUT',
          body: { isComplete },
        }).catch(() => {});
      }
    },
    [exercises],
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
      name: item.name,
      muscleGroup: item.muscleGroup,
      description: item.description,
    })),
  };
}

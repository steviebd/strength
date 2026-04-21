import { useState, useCallback, useEffect, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { getLastWorkout, setLastWorkout } from '@/lib/storage';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import type {
  Workout,
  WorkoutExercise,
  WorkoutSet,
  Exercise,
} from '@/context/WorkoutSessionContext';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  startWorkout: (name: string) => Promise<void>;
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

  const startWorkout = useCallback(
    async (name: string) => {
      if (!session.data?.user) return;
      setIsLoading(true);
      setError(null);
      try {
        const workoutData = await apiFetch<Workout>('/api/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        setWorkout(workoutData);
        setExercises([]);
        setDuration(0);
        startTimeRef.current = new Date();
        timerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start workout');
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
            if (set.id && set.id.includes('-') && set.id.length > 30) {
              await apiFetch(`/api/workouts/sets/${set.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  weight: set.weight,
                  reps: set.reps,
                  rpe: set.rpe,
                  isComplete: set.isComplete,
                }),
              });
            } else {
              await apiFetch('/api/workouts/sets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  workoutExerciseId: existingWorkoutExercise.id,
                  setNumber: j + 1,
                  weight: set.weight,
                  reps: set.reps,
                  rpe: set.rpe,
                  isComplete: set.isComplete,
                }),
              });
            }
          }
        } else {
          const workoutExercise = await apiFetch<{ id: string }>(
            `/api/workouts/${workout.id}/exercises`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                exerciseId: exercise.exerciseId,
                orderIndex: i,
              }),
            },
          );

          for (let j = 0; j < exercise.sets.length; j++) {
            const set = exercise.sets[j];
            await apiFetch('/api/workouts/sets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workoutExerciseId: workoutExercise.id,
                setNumber: j + 1,
                weight: set.weight,
                reps: set.reps,
                rpe: set.rpe,
                isComplete: set.isComplete,
              }),
            });
          }
        }
      }

      await apiFetch(`/api/workouts/${workout.id}/complete`, {
        method: 'PUT',
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
      } catch (err) {
        console.error('Failed to delete workout:', err);
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
                  id: generateId(),
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
                  id: generateId(),
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
          id: generateId(),
          exerciseId: exercise.id,
          name: exercise.name,
          muscleGroup: exercise.muscleGroup,
          orderIndex: exercises.length,
          sets: newSets,
          notes: null,
          isAmrap: exercise.name.endsWith('3+') || exercise.name.toLowerCase().includes('amrap'),
        };
        setExercises((prev) => [...prev, newWorkoutExercise]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add exercise');
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
          id: generateId(),
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
      if (set && set.id.includes('-') && set.id.length > 30) {
        apiFetch(`/api/workouts/sets/${setId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }).catch(console.error);
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
      if (set) {
        if (set.id.includes('-') && set.id.length > 30) {
          apiFetch(`/api/workouts/sets/${setId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isComplete }),
          }).catch(console.error);
        }
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
    availableExercises: [
      {
        id: 'barbell-bench-press',
        name: 'Bench Press',
        muscleGroup: 'Chest',
        description:
          'A compound exercise where you lie on a bench and press a barbell up from chest level, primarily targeting the pectoralis major.',
      },
      {
        id: 'dumbbell-bench-press',
        name: 'Dumbbell Bench Press',
        muscleGroup: 'Chest',
        description:
          'A compound chest exercise performed on a bench using dumbbells, allowing for a greater range of motion and independent arm movement.',
      },
      {
        id: 'incline-dumbbell-press',
        name: 'Incline Dumbbell Press',
        muscleGroup: 'Chest',
        description:
          'A variation of the bench press performed on an incline bench, emphasizing the upper portion of the pectoralis major.',
      },
      {
        id: 'barbell-row',
        name: 'Barbell Row',
        muscleGroup: 'Back',
        description:
          'A compound back exercise where you bend over and pull a barbell toward your lower chest, targeting the latissimus dorsi and rhomboids.',
      },
      {
        id: 'deadlift',
        name: 'Deadlift',
        muscleGroup: 'Back',
        description:
          'A compound exercise lifting a barbell from the floor to hip level, working the entire posterior chain including back, glutes, and hamstrings.',
      },
      {
        id: 'lat-pulldown',
        name: 'Lat Pulldown',
        muscleGroup: 'Back',
        description:
          'A cable exercise pulling a bar down to chest level while seated, effectively targeting the latissimus dorsi and upper back muscles.',
      },
      {
        id: 'pull-ups',
        name: 'Pull-ups',
        muscleGroup: 'Back',
        description:
          'A bodyweight exercise hanging from a bar and pulling yourself up, primarily working the lats with secondary engagement of biceps and rear delts.',
      },
      {
        id: 'seated-cable-row',
        name: 'Seated Cable Row',
        muscleGroup: 'Back',
        description:
          'A compound back exercise performed sitting, pulling a handle toward the abdomen while keeping the back straight, targeting the middle back.',
      },
      {
        id: 'dumbbell-row',
        name: 'Dumbbell Row',
        muscleGroup: 'Back',
        description:
          'A unilateral back exercise bent over with one hand supporting, pulling a dumbbell up to the hip to target the lat and upper back.',
      },
      {
        id: 'overhead-press',
        name: 'Overhead Press',
        muscleGroup: 'Shoulders',
        description:
          'A compound shoulder exercise pressing a barbell from shoulders to overhead, primarily targeting the anterior and lateral deltoids.',
      },
      {
        id: 'dumbbell-shoulder-press',
        name: 'Dumbbell Shoulder Press',
        muscleGroup: 'Shoulders',
        description:
          'A shoulder exercise pressing dumbbells from shoulder height to overhead, allowing greater shoulder stabilization and range of motion.',
      },
      {
        id: 'lateral-raises',
        name: 'Lateral Raises',
        muscleGroup: 'Shoulders',
        description:
          'An isolation exercise raising dumbbells to the sides to target the lateral deltoid muscles, creating shoulder width and definition.',
      },
      {
        id: 'barbell-curl',
        name: 'Barbell Curl',
        muscleGroup: 'Biceps',
        description:
          'The classic biceps exercise curling a barbell from hip level to the shoulders, primarily targeting the biceps brachii.',
      },
      {
        id: 'dumbbell-curl',
        name: 'Dumbbell Curl',
        muscleGroup: 'Biceps',
        description:
          'A fundamental bicep curl using individual dumbbells, allowing each arm to work independently with a full range of motion.',
      },
      {
        id: 'tricep-pushdown',
        name: 'Tricep Pushdowns',
        muscleGroup: 'Triceps',
        description:
          'A cable exercise pushing a bar down by extending the elbows, one of the most effective exercises for targeting the triceps.',
      },
      {
        id: 'skull-crushers',
        name: 'Skull Crushers',
        muscleGroup: 'Triceps',
        description:
          'An isolation exercise lowering a weight to the forehead while lying on a bench, then extending the arms to work the triceps.',
      },
      {
        id: 'barbell-squat',
        name: 'Squat',
        muscleGroup: 'Quads',
        description:
          'The king of leg exercises, squatting with a barbell on the back to build overall leg mass and strength, primarily targeting quads.',
      },
      {
        id: 'leg-press',
        name: 'Leg Press',
        muscleGroup: 'Quads',
        description:
          'A machine-based compound exercise pushing a platform away while seated, targeting the quadriceps with less spinal loading than squats.',
      },
      {
        id: 'lunges',
        name: 'Walking Lunges',
        muscleGroup: 'Quads',
        description:
          'A unilateral leg exercise stepping forward and lowering the body, targeting quads, glutes, and hamstrings while improving balance.',
      },
      {
        id: 'romanian-deadlift',
        name: 'Romanian Deadlift',
        muscleGroup: 'Hamstrings',
        description:
          'A hip-hinge movement lowering a barbell while keeping legs slightly bent, intensely targeting the hamstrings and glutes.',
      },
      {
        id: 'leg-curl',
        name: 'Leg Curl',
        muscleGroup: 'Hamstrings',
        description:
          'A machine isolation exercise curling the legs against resistance while lying down, directly targeting the hamstring muscles.',
      },
      {
        id: 'hip-thrust',
        name: 'Hip Thrust',
        muscleGroup: 'Glutes',
        description:
          'A glute isolation exercise thrusting hips upward with weight on the pelvis, one of the most effective movements for glute development.',
      },
      {
        id: 'plank',
        name: 'Plank',
        muscleGroup: 'Core',
        description:
          'An isometric core exercise holding a push-up position, engaging the entire midsection including abs, obliques, and lower back.',
      },
    ],
  };
}

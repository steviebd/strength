import { createContext, useContext, type ReactNode } from 'react';
import { useWorkoutSession } from '@/hooks/useWorkoutSession';

export interface WorkoutSet {
  id: string;
  workoutExerciseId: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  duration: number | null;
  distance: number | null;
  height: number | null;
  isComplete: boolean;
  completedAt: string | null;
  createdAt: string | null;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  libraryId?: string | null;
  name: string;
  muscleGroup: string | null;
  exerciseType: string;
  orderIndex: number;
  sets: WorkoutSet[];
  notes: string | null;
  isAmrap: boolean;
}

export interface Workout {
  id: string;
  name: string;
  workoutType?: 'training' | 'one_rm_test';
  templateId?: string | null;
  programCycleId?: string | null;
  cycleWorkoutId?: string | null;
  syncStatus?: 'local' | 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  exercises: WorkoutExercise[];
  totalVolume?: number;
  totalSets?: number;
  durationMinutes?: number;
  exerciseCount?: number;
}

export interface Exercise {
  id: string;
  libraryId?: string | null;
  name: string;
  muscleGroup: string;
  description: string;
  exerciseType?: string;
  isAmrap?: boolean;
  videoTutorial?: {
    youtubeId: string;
    title: string;
    coachName: string;
    keyCues: string[];
  };
}

export type ExerciseLibraryItem = Exercise;

interface WorkoutSessionContextValue {
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
  discardWorkout: () => void;
  addExercise: (exercise: Exercise) => Promise<void>;
  updateExercise: (workoutExerciseId: string, updates: Partial<WorkoutExercise>) => void;
  removeExercise: (workoutExerciseId: string) => void;
  addSet: (workoutExerciseId: string) => void;
  updateSet: (setId: string, updates: Partial<WorkoutSet>) => void;
  deleteSet: (setId: string) => void;
  toggleSetComplete: (setId: string) => void;
  getLastWorkoutData: (exerciseId: string) => {
    weight: number | null;
    reps: number | null;
    duration: number | null;
    distance: number | null;
    height: number | null;
  } | null;
  availableExercises: Exercise[];
}

const WorkoutSessionContext = createContext<WorkoutSessionContextValue | null>(null);

export function WorkoutSessionProvider({ children }: { children: ReactNode }) {
  const workoutSession = useWorkoutSession();

  return (
    <WorkoutSessionContext.Provider value={workoutSession}>
      {children}
    </WorkoutSessionContext.Provider>
  );
}

export function useWorkoutSessionContext(): WorkoutSessionContextValue {
  const context = useContext(WorkoutSessionContext);
  if (!context) {
    throw new Error('useWorkoutSessionContext must be used within WorkoutSessionProvider');
  }
  return context;
}

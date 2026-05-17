import { Platform } from 'react-native';
import { apiFetch } from '@/lib/api';
import {
  createLocalWorkout,
  createLocalWorkoutFromCurrentProgramCycle,
  createLocalWorkoutFromProgramCycleWorkout,
  createLocalWorkoutFromTemplate,
  type ExerciseHistorySnapshot,
} from '@/db/workouts';
import type { Workout } from '@/context/WorkoutSessionContext';

type TemplateStartInput = {
  id: string;
  name?: string | null;
};

type TemplateExerciseStartInput = {
  exerciseId: string;
  libraryId?: string | null;
  name: string;
  muscleGroup: string | null;
  exerciseType?: string | null;
  sets: number;
  reps: number;
  isAmrap: boolean;
  targetWeight: number;
  addedWeight: number;
  targetDuration?: number | null;
  targetDistance?: number | null;
  targetHeight?: number | null;
  orderIndex: number;
};

type TemplateStartOptions = {
  historySnapshots?: ExerciseHistorySnapshot[];
  ignoreHistory?: boolean;
};

export type StartedWorkout = {
  workoutId: string;
  programCycleId?: string | null;
  cycleWorkoutId?: string | null;
  completed?: boolean;
};

function shouldUseLocalDrafts() {
  return Platform.OS !== 'web';
}

export async function startCustomWorkoutDraft(userId: string, name: string) {
  if (shouldUseLocalDrafts()) {
    const local = await createLocalWorkout(userId, { name });
    if (local) return local;
  }

  return apiFetch<Workout>('/api/workouts', {
    method: 'POST',
    body: { name },
  });
}

export async function startTemplateWorkoutDraft(
  userId: string,
  template: TemplateStartInput,
  options: TemplateStartOptions,
  exercises: TemplateExerciseStartInput[],
) {
  if (shouldUseLocalDrafts()) {
    const local = await createLocalWorkoutFromTemplate(userId, template.id, options, exercises);
    if (local) return { workoutId: local.id };
  }

  const remote = await apiFetch<{ id: string }>('/api/workouts', {
    method: 'POST',
    body: {
      name: template.name || 'Workout',
      templateId: template.id,
      ignoreHistory: options.ignoreHistory ?? false,
      historySnapshots: options.historySnapshots ?? [],
    },
  });

  return { workoutId: remote.id };
}

export async function startCurrentProgramWorkoutDraft(userId: string, programCycleId: string) {
  if (shouldUseLocalDrafts()) {
    const local = await createLocalWorkoutFromCurrentProgramCycle(userId, programCycleId);
    if (local?.id) {
      return {
        workoutId: local.id,
        programCycleId: local.programCycleId ?? programCycleId,
        cycleWorkoutId: local.cycleWorkoutId ?? null,
      };
    }
  }

  const remote = await apiFetch<StartedWorkout>(
    `/api/programs/cycles/${programCycleId}/workouts/current/start`,
    { method: 'POST' },
  );

  return {
    workoutId: remote.workoutId,
    programCycleId,
    cycleWorkoutId: remote.cycleWorkoutId ?? null,
    completed: remote.completed,
  };
}

export async function startCycleWorkoutDraft(userId: string, cycleWorkoutId: string) {
  if (shouldUseLocalDrafts()) {
    const local = await createLocalWorkoutFromProgramCycleWorkout(userId, cycleWorkoutId);
    if (local?.id) {
      return {
        workoutId: local.id,
        sessionName: local.name,
        created: true,
        completed: false,
        programCycleId: local.programCycleId,
        cycleWorkoutId: local.cycleWorkoutId,
      };
    }
  }

  const remote = await apiFetch<{
    workoutId: string;
    sessionName: string;
    created: boolean;
    completed: boolean;
    programCycleId: string;
  }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/start`, {
    method: 'POST',
  });

  return {
    ...remote,
    cycleWorkoutId,
  };
}

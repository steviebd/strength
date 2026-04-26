import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type ProgramScheduleWorkout = {
  cycleWorkoutId: string;
  workoutId: string | null;
  weekNumber: number;
  sessionNumber: number;
  name: string;
  exercises: string[];
  scheduledAt: number | null;
  status: 'today' | 'upcoming' | 'complete' | 'missed' | 'unscheduled';
};

type ProgramScheduleCycle = {
  id: string;
  name: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
};

type ProgramScheduleResponse = {
  cycle: ProgramScheduleCycle;
  thisWeek: ProgramScheduleWorkout[];
  upcoming: ProgramScheduleWorkout[];
  completed: ProgramScheduleWorkout[];
};

export function useProgramSchedule(cycleId: string) {
  return useQuery({
    queryKey: ['programSchedule', cycleId],
    queryFn: async () => {
      const response = await apiFetch<ProgramScheduleResponse>(
        `/api/programs/cycles/${cycleId}/schedule`,
      );
      return response;
    },
    enabled: Boolean(cycleId),
  });
}

export function useStartCycleWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cycleWorkoutId: string) => {
      const response = await apiFetch<{
        workoutId: string;
        sessionName: string;
        created: boolean;
        completed: boolean;
        programCycleId: string;
      }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['programSchedule', data.programCycleId] });
      queryClient.invalidateQueries({ queryKey: ['activePrograms'] });
    },
  });
}

export function useRescheduleWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      cycleWorkoutId,
      scheduledAt,
    }: {
      cycleWorkoutId: string;
      scheduledAt: number;
    }) => {
      const response = await apiFetch<{
        workout: ProgramScheduleWorkout;
        warning?: 'date_collision';
      }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programSchedule'] });
    },
  });
}

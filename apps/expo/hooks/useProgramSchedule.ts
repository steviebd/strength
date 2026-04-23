import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';

export type ProgramScheduleWorkout = {
  cycleWorkoutId: string;
  workoutId: string | null;
  weekNumber: number;
  sessionNumber: number;
  name: string;
  exercises: string[];
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduledTimezone: string | null;
  status: 'today' | 'upcoming' | 'complete' | 'missed' | 'unscheduled';
};

export type ProgramScheduleCycle = {
  id: string;
  name: string;
  timezone: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
};

export type ProgramScheduleResponse = {
  cycle: ProgramScheduleCycle;
  thisWeek: ProgramScheduleWorkout[];
  upcoming: ProgramScheduleWorkout[];
  completed: ProgramScheduleWorkout[];
};

export function useProgramSchedule(cycleId: string) {
  const { activeTimezone } = useUserPreferences();

  return useQuery({
    queryKey: ['programSchedule', cycleId, activeTimezone],
    queryFn: async () => {
      const response = await apiFetch<ProgramScheduleResponse>(
        `/api/programs/cycles/${cycleId}/schedule?timezone=${encodeURIComponent(activeTimezone ?? '')}`,
      );
      return response;
    },
    enabled: Boolean(cycleId),
  });
}

export function useStartCycleWorkout() {
  const queryClient = useQueryClient();
  const { activeTimezone } = useUserPreferences();

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
        body: JSON.stringify({ timezone: activeTimezone }),
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
  const { activeTimezone } = useUserPreferences();

  return useMutation({
    mutationFn: async ({
      cycleWorkoutId,
      scheduledDate,
      scheduledTime,
    }: {
      cycleWorkoutId: string;
      scheduledDate: string;
      scheduledTime?: string | null;
    }) => {
      const response = await apiFetch<{
        workout: ProgramScheduleWorkout;
        warning?: 'date_collision';
      }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledDate,
          scheduledTime,
          timezone: activeTimezone,
        }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programSchedule'] });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { getCachedProgramSchedule } from '@/db/training-cache';
import { useOfflineQuery } from './useOfflineQuery';
import { tryOnlineOrEnqueue } from '@/lib/offline-mutation';

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
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const { activeTimezone } = useUserPreferences();
  return useOfflineQuery({
    queryKey: ['programSchedule', cycleId],
    enabled: Boolean(cycleId),
    apiFn: () => apiFetch<ProgramScheduleResponse>(`/api/programs/cycles/${cycleId}/schedule`),
    cacheFn: () => getCachedProgramSchedule(userId!, cycleId, activeTimezone ?? 'UTC'),
    writeCacheFn: async () => {},
  });
}

export function useStartCycleWorkout() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  return useMutation({
    mutationFn: async (cycleWorkoutId: string) => {
      if (!userId) {
        return apiFetch<{
          workoutId: string;
          sessionName: string;
          created: boolean;
          completed: boolean;
          programCycleId: string;
        }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/start`, {
          method: 'POST',
          body: {},
        });
      }
      return tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch<{
            workoutId: string;
            sessionName: string;
            created: boolean;
            completed: boolean;
            programCycleId: string;
          }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/start`, {
            method: 'POST',
            body: {},
          }),
        userId,
        entityType: 'program',
        operation: 'start_cycle_workout',
        entityId: cycleWorkoutId,
        payload: {},
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['programSchedule', data.programCycleId] });
      queryClient.invalidateQueries({ queryKey: ['activePrograms'] });
    },
  });
}

export function useRescheduleWorkout() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  return useMutation({
    mutationFn: async ({
      cycleWorkoutId,
      scheduledAt,
    }: {
      cycleWorkoutId: string;
      scheduledAt: number;
    }) => {
      if (!userId) {
        throw new Error('Not authenticated');
      }
      const response = await tryOnlineOrEnqueue({
        apiCall: () =>
          apiFetch<{
            workout: ProgramScheduleWorkout;
            warning?: 'date_collision';
          }>(`/api/programs/cycle-workouts/${cycleWorkoutId}/schedule`, {
            method: 'PUT',
            body: { scheduledAt },
          }),
        userId,
        entityType: 'program',
        entityId: cycleWorkoutId,
        operation: 'reschedule_workout',
        payload: { scheduledAt },
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programSchedule'] });
    },
  });
}

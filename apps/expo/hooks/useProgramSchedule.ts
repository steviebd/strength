import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eq } from 'drizzle-orm';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { getCachedProgramSchedule } from '@/db/training-cache';
import { getLocalDb } from '@/db/client';
import { localProgramCycleWorkouts } from '@/db/local-schema';
import { hasPendingTrainingWrites } from '@/db/training-read-model';
import { startCycleWorkoutDraft } from '@/lib/workout-start';
import { useOfflineQuery } from './useOfflineQuery';
import { tryOnlineOrEnqueue, OfflineError } from '@/lib/offline-mutation';

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
    apiFn: () =>
      apiFetch<ProgramScheduleResponse>(
        `/api/programs/cycles/${cycleId}/schedule${activeTimezone ? `?timezone=${encodeURIComponent(activeTimezone)}` : ''}`,
      ),
    cacheFn: () => getCachedProgramSchedule(userId!, cycleId, activeTimezone ?? 'UTC'),
    writeCacheFn: async () => {},
    isDirtyFn: () =>
      userId
        ? hasPendingTrainingWrites(userId, ['program', 'program_cycle', 'workout'])
        : Promise.resolve(false),
    staleTime: Infinity,
  });
}

export function useStartCycleWorkout() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  return useMutation({
    mutationFn: async (cycleWorkoutId: string) => {
      if (!userId) {
        throw new Error('Not authenticated');
      }

      const started = await startCycleWorkoutDraft(userId, cycleWorkoutId);
      if (!started.workoutId) {
        throw new Error('Failed to create workout. Please try again.');
      }
      return started;
    },
    onMutate: async (cycleWorkoutId: string) => {
      if (!userId) return {};

      const db = getLocalDb();
      if (!db) return {};
      const row = db
        .select({ cycleId: localProgramCycleWorkouts.cycleId })
        .from(localProgramCycleWorkouts)
        .where(eq(localProgramCycleWorkouts.id, cycleWorkoutId))
        .get();
      const cycleId = row?.cycleId;
      if (!cycleId) return {};

      const queryKey = ['programSchedule', cycleId];
      await queryClient.cancelQueries({ queryKey });
      const previousSchedule = queryClient.getQueryData(queryKey);
      return { previousSchedule, cycleId };
    },
    onError: (error, _cycleWorkoutId, context) => {
      if (error instanceof OfflineError) return;
      if (!context?.cycleId) return;
      const queryKey = ['programSchedule', context.cycleId];
      queryClient.setQueryData(queryKey, context?.previousSchedule);
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
  const { activeTimezone } = useUserPreferences();

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
            body: { scheduledAt, timezone: activeTimezone },
          }),
        userId,
        entityType: 'program',
        entityId: cycleWorkoutId,
        operation: 'reschedule_workout',
        payload: { scheduledAt },
        onEnqueue: async () => {
          const db = getLocalDb();
          if (!db) return;
          db.update(localProgramCycleWorkouts)
            .set({ scheduledAt: new Date(scheduledAt) })
            .where(eq(localProgramCycleWorkouts.id, cycleWorkoutId))
            .run();
        },
      });
      return response;
    },
    onMutate: async ({ cycleWorkoutId, scheduledAt }) => {
      if (!userId) return {};

      const db = getLocalDb();
      if (!db) return {};
      const row = db
        .select({ cycleId: localProgramCycleWorkouts.cycleId })
        .from(localProgramCycleWorkouts)
        .where(eq(localProgramCycleWorkouts.id, cycleWorkoutId))
        .get();
      const cycleId = row?.cycleId;
      if (!cycleId) return {};

      const queryKey = ['programSchedule', cycleId];
      await queryClient.cancelQueries({ queryKey });
      const previousSchedule = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        const updateWorkout = (w: any) =>
          w.cycleWorkoutId === cycleWorkoutId ? { ...w, scheduledAt } : w;
        return {
          ...old,
          thisWeek: old.thisWeek?.map(updateWorkout),
          upcoming: old.upcoming?.map(updateWorkout),
          completed: old.completed?.map(updateWorkout),
        };
      });
      return { previousSchedule, cycleId };
    },
    onError: (error, _variables, context) => {
      if (error instanceof OfflineError) return;
      if (!context?.cycleId) return;
      const queryKey = ['programSchedule', context.cycleId];
      queryClient.setQueryData(queryKey, context?.previousSchedule);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['programSchedule'] });
    },
  });
}

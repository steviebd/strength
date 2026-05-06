import { useMutation, useQueryClient } from '@tanstack/react-query';
import { eq, and, or, sql } from 'drizzle-orm';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { getCachedProgramSchedule } from '@/db/training-cache';
import { getLocalDb } from '@/db/client';
import { localProgramCycleWorkouts, localSyncQueue } from '@/db/local-schema';
import { createLocalWorkoutFromProgramCycleWorkoutDefinition } from '@/db/workouts';
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
    apiFn: () => apiFetch<ProgramScheduleResponse>(`/api/programs/cycles/${cycleId}/schedule`),
    cacheFn: () => getCachedProgramSchedule(userId!, cycleId, activeTimezone ?? 'UTC'),
    writeCacheFn: async () => {},
    isDirtyFn: async () => {
      if (!userId) return false;
      const db = getLocalDb();
      if (!db) return false;
      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(localSyncQueue)
        .where(
          and(
            eq(localSyncQueue.userId, userId),
            eq(localSyncQueue.operation, 'reschedule_workout'),
            or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
          ),
        )
        .get();
      return (result?.count ?? 0) > 0;
    },
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

      const definition = await apiFetch<any>(`/api/programs/cycle-workouts/${cycleWorkoutId}`);
      if (definition.isComplete) {
        return {
          workoutId: definition.workoutId ?? '',
          sessionName: definition.sessionName,
          created: false,
          completed: true,
          programCycleId: definition.cycleId,
        };
      }

      const local = await createLocalWorkoutFromProgramCycleWorkoutDefinition(userId, definition);
      if (!local?.id) {
        throw new Error('Failed to create workout locally. Please try again.');
      }

      return {
        workoutId: local.id,
        sessionName: local.name,
        created: true,
        completed: false,
        programCycleId: local.programCycleId ?? definition.cycleId,
      };
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

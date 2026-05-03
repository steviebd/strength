import { sql, and, or, eq, inArray } from 'drizzle-orm';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { getLocalDb } from '@/db/client';
import { localSyncQueue } from '@/db/local-schema';
import { cacheActivePrograms } from '@/db/workouts';
import {
  getCachedActivePrograms,
  getCachedProgramsCatalog,
  cacheProgramsCatalog,
  getCachedLatestOneRMs,
  cacheLatestOneRMs,
  getFallbackLatestOneRMsFromCycles,
} from '@/db/training-cache';
import { useOfflineQuery } from './useOfflineQuery';

export interface ProgramListItem {
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  daysPerWeek: number;
  estimatedWeeks: number;
  totalSessions: number;
}

export interface ActiveProgram {
  id: string;
  programSlug: string;
  name: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
}

interface LatestOneRMs {
  squat1rm: number | null;
  bench1rm: number | null;
  deadlift1rm: number | null;
  ohp1rm: number | null;
}

export function useProgramsCatalog(fallbackPrograms: ProgramListItem[] = []) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const programsQuery = useOfflineQuery({
    queryKey: ['programs', userId],
    enabled: !!userId,
    apiFn: () => apiFetch<ProgramListItem[]>('/api/programs'),
    cacheFn: () => getCachedProgramsCatalog(userId!),
    writeCacheFn: (data) => cacheProgramsCatalog(userId!, data),
    isDirtyFn: async () => {
      const db = getLocalDb();
      if (!db) return false;
      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(localSyncQueue)
        .where(
          and(
            eq(localSyncQueue.userId, userId!),
            inArray(localSyncQueue.operation, ['start_program', 'delete_program']),
            or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
          ),
        )
        .get();
      return (result?.count ?? 0) > 0;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  const programs =
    programsQuery.data && programsQuery.data.length > 0 ? programsQuery.data : fallbackPrograms;

  return {
    programs,
    isLoading: session.isPending || programsQuery.isLoading,
    isError: programsQuery.isError,
    error: programsQuery.error,
    refetch: programsQuery.refetch,
  };
}

export function useActivePrograms() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const activeProgramsQuery = useOfflineQuery({
    queryKey: ['activePrograms', userId],
    enabled: !!userId,
    apiFn: () => apiFetch<ActiveProgram[]>('/api/programs/active').then((d) => d ?? []),
    cacheFn: () =>
      getCachedActivePrograms(userId!).then((rows) =>
        rows.length
          ? rows.map((program) => ({
              id: program.id,
              programSlug: program.programSlug,
              name: program.name,
              currentWeek: program.currentWeek,
              currentSession: program.currentSession,
              totalSessionsCompleted: program.totalSessionsCompleted,
              totalSessionsPlanned: program.totalSessionsPlanned,
            }))
          : null,
      ),
    writeCacheFn: (data) => cacheActivePrograms(userId!, data),
    isDirtyFn: async () => {
      const db = getLocalDb();
      if (!db) return false;
      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(localSyncQueue)
        .where(
          and(
            eq(localSyncQueue.userId, userId!),
            eq(localSyncQueue.entityType, 'program'),
            or(
              eq(localSyncQueue.operation, 'start_cycle_workout'),
              eq(localSyncQueue.operation, 'reschedule_workout'),
            ),
            or(eq(localSyncQueue.status, 'pending'), eq(localSyncQueue.status, 'syncing')),
          ),
        )
        .get();
      return (result?.count ?? 0) > 0;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return {
    activePrograms: activeProgramsQuery.data ?? [],
    isLoading: session.isPending || activeProgramsQuery.isLoading,
    isError: activeProgramsQuery.isError,
    error: activeProgramsQuery.error,
    refetch: activeProgramsQuery.refetch,
  };
}

export function useLatestOneRms() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const latestOneRmsQuery = useOfflineQuery({
    queryKey: ['latestOneRms', userId],
    enabled: !!userId,
    apiFn: () => apiFetch<LatestOneRMs | null>('/api/programs/latest-1rms'),
    cacheFn: async () => {
      const cached = await getCachedLatestOneRMs(userId!);
      if (cached) return cached;
      return getFallbackLatestOneRMsFromCycles(userId!);
    },
    writeCacheFn: (data) => cacheLatestOneRMs(userId!, data),
    isDirtyFn: async () => {
      const cached = await getCachedLatestOneRMs(userId!);
      if (!cached) return false;
      const fromCycles = await getFallbackLatestOneRMsFromCycles(userId!);
      if (!fromCycles) return false;
      return (
        cached.squat1rm !== fromCycles.squat1rm ||
        cached.bench1rm !== fromCycles.bench1rm ||
        cached.deadlift1rm !== fromCycles.deadlift1rm ||
        cached.ohp1rm !== fromCycles.ohp1rm
      );
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return {
    latestOneRMs: latestOneRmsQuery.data ?? null,
    isLoading: session.isPending || latestOneRmsQuery.isLoading,
    isError: latestOneRmsQuery.isError,
    error: latestOneRmsQuery.error,
    refetch: latestOneRmsQuery.refetch,
  };
}

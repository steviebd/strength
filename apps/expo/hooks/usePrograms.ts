import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { cacheActivePrograms } from '@/db/workouts';
import {
  getCachedActivePrograms,
  getCachedProgramsCatalog,
  cacheProgramsCatalog,
  getCachedLatestOneRMs,
  cacheLatestOneRMs,
} from '@/db/training-cache';
import {
  getFreshLatestOneRMs,
  hasPendingTrainingWrites,
  shouldUseLocalLatestOneRMs,
  type LatestOneRMs,
} from '@/db/training-read-model';
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

export function useProgramsCatalog(fallbackPrograms: ProgramListItem[] = []) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const programsQuery = useOfflineQuery({
    queryKey: ['programs', userId],
    enabled: !!userId,
    apiFn: () => apiFetch<ProgramListItem[]>('/api/programs'),
    cacheFn: () => getCachedProgramsCatalog(userId!),
    writeCacheFn: (data) => cacheProgramsCatalog(userId!, data),
    isDirtyFn: () => hasPendingTrainingWrites(userId!, ['program']),
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
    isDirtyFn: () => hasPendingTrainingWrites(userId!, ['program', 'program_cycle', 'workout']),
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
      return getFreshLatestOneRMs(userId!, cached);
    },
    writeCacheFn: (data) => cacheLatestOneRMs(userId!, data),
    isDirtyFn: async () =>
      shouldUseLocalLatestOneRMs(userId!, await getCachedLatestOneRMs(userId!)),
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

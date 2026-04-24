import { useQuery } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';

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

  const programsQuery = useQuery({
    queryKey: ['programs', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ProgramListItem[]> => {
      return apiFetch<ProgramListItem[]>('/api/programs');
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

  const activeProgramsQuery = useQuery({
    queryKey: ['activePrograms', userId],
    enabled: !!userId,
    queryFn: async (): Promise<ActiveProgram[]> => {
      return apiFetch<ActiveProgram[]>('/api/programs/active');
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

  const latestOneRmsQuery = useQuery({
    queryKey: ['latestOneRms', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LatestOneRMs | null> => {
      return apiFetch<LatestOneRMs | null>('/api/programs/latest-1rms');
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

import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { authClient } from '@/lib/auth-client';
import { buildLocalHomeSummary } from '@/db/training-cache';
import { hasPendingTrainingWrites } from '@/db/training-read-model';
import { useOfflineQuery } from './useOfflineQuery';

type HomeScheduledWorkout = {
  cycleWorkoutId: string;
  workoutId: string | null;
  name: string;
  focus: string;
  exercises: { name: string; count: number }[];
  programName: string;
  programCycleId: string;
  scheduledAt: number | null;
  isComplete: boolean;
};

type HomeNextWorkout = {
  cycleWorkoutId: string;
  name: string;
  programName: string;
  scheduledAt: number | null;
};

type HomeSummaryResponse = {
  date: {
    localDate: string;
    timezone: string;
    formatted: string;
  };
  todayWorkout: {
    workout: HomeScheduledWorkout | null;
    nextWorkout: HomeNextWorkout | null;
    hasActiveProgram: boolean;
    isRestDay: boolean;
  };
  weeklyStats: {
    workoutsCompleted: number;
    workoutsTarget: number;
    streakDays: number;
    totalVolume: number;
    totalVolumeLabel: string;
  };
  oneRepMaxes: {
    squat: number | null;
    bench: number | null;
    deadlift: number | null;
    ohp: number | null;
  };
  recoverySnapshot: {
    sleepDurationLabel: string | null;
    sleepPerformancePercentage: number | null;
    recoveryScore: number | null;
    recoveryStatus: 'green' | 'yellow' | 'red' | null;
    strain: number | null;
    isWhoopConnected: boolean;
  };
};

export function useHomeSummary() {
  const { activeTimezone } = useUserPreferences();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  return useOfflineQuery({
    queryKey: ['homeSummary', activeTimezone],
    enabled: !!userId,
    apiFn: () => apiFetch<HomeSummaryResponse>(`/api/home/summary`),
    cacheFn: () =>
      buildLocalHomeSummary(userId!, activeTimezone ?? 'UTC') as Promise<HomeSummaryResponse>,
    writeCacheFn: async () => {},
    isDirtyFn: () =>
      hasPendingTrainingWrites(userId!, ['program', 'program_cycle', 'workout', 'one_rms']),
    fallbackToCacheOnError: true,
    refetchInterval: 60 * 1000,
  });
}

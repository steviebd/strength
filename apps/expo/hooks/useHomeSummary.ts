import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { authClient } from '@/lib/auth-client';
import { buildLocalHomeSummary } from '@/db/training-cache';

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

  return useQuery({
    queryKey: ['homeSummary', activeTimezone],
    queryFn: async () => {
      try {
        const response = await apiFetch<HomeSummaryResponse>(`/api/home/summary`);
        return response;
      } catch (error) {
        if (userId) {
          return (await buildLocalHomeSummary(
            userId,
            activeTimezone ?? 'UTC',
          )) as HomeSummaryResponse;
        }
        throw error;
      }
    },
    refetchInterval: 60 * 1000,
  });
}

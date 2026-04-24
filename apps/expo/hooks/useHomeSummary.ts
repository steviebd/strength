import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';

type HomeScheduledWorkout = {
  cycleWorkoutId: string;
  workoutId: string | null;
  name: string;
  focus: string;
  exercises: string[];
  programName: string;
  programCycleId: string;
  scheduledDate: string;
  scheduledTime: string | null;
  scheduledTimezone: string;
  isComplete: boolean;
};

type HomeNextWorkout = {
  cycleWorkoutId: string;
  name: string;
  programName: string;
  scheduledDate: string;
  scheduledTime: string | null;
  scheduledTimezone: string;
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

  return useQuery({
    queryKey: ['homeSummary', activeTimezone],
    queryFn: async () => {
      const response = await apiFetch<HomeSummaryResponse>(
        `/api/home/summary?timezone=${encodeURIComponent(activeTimezone ?? 'UTC')}`,
      );
      return response;
    },
    refetchInterval: 60 * 1000,
  });
}

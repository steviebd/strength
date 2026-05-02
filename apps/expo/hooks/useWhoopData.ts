import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { getTodayLocalDate } from '@/lib/timezone';
import { getCachedWhoopData, cacheWhoopData, type WhoopCacheData } from '@/db/whoop';
import { authClient } from '@/lib/auth-client';

interface WhoopRecovery {
  score: number | null;
  status: 'green' | 'yellow' | 'red' | null;
  hrv: number | null;
}

interface WhoopCycle {
  caloriesBurned: number | null;
  totalStrain: number | null;
}

interface WhoopCache {
  recovery: WhoopRecovery | null;
  cycle: WhoopCycle | null;
  timestamp: number;
}

interface UseWhoopDataResult {
  data: WhoopCache | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const STALENESS_MS = 15 * 60 * 1000;

function toWhoopCache(cached: { data: WhoopCacheData; hydratedAt: Date }): WhoopCache {
  return {
    recovery:
      cached.data.recoveryScore !== null
        ? {
            score: cached.data.recoveryScore,
            status: cached.data.status,
            hrv: cached.data.hrv,
          }
        : null,
    cycle:
      cached.data.caloriesBurned !== null
        ? {
            caloriesBurned: cached.data.caloriesBurned,
            totalStrain: cached.data.totalStrain,
          }
        : null,
    timestamp: cached.hydratedAt.getTime(),
  };
}

export function useWhoopData(
  date: string = getTodayLocalDate(),
  timezone: string = 'UTC',
): UseWhoopDataResult {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const query = useQuery<WhoopCache | null>({
    queryKey: ['whoop', userId, date, timezone],
    queryFn: async () => {
      if (!userId) return null;

      const cached = await getCachedWhoopData(userId, date, timezone);
      if (cached) {
        return toWhoopCache(cached);
      }

      const response = await apiFetch<{
        whoopRecovery: WhoopRecovery;
        whoopCycle: WhoopCycle;
        whoopUpdatedAt: number | null;
      }>(`/api/nutrition/daily-summary?date=${date}`);

      await cacheWhoopData(
        userId,
        date,
        timezone,
        {
          recoveryScore: response.whoopRecovery?.score ?? null,
          status: response.whoopRecovery?.status ?? null,
          hrv: response.whoopRecovery?.hrv ?? null,
          caloriesBurned: response.whoopCycle?.caloriesBurned ?? null,
          totalStrain: response.whoopCycle?.totalStrain ?? null,
        },
        response.whoopUpdatedAt,
      );

      return {
        recovery: response.whoopRecovery,
        cycle: response.whoopCycle,
        timestamp: Date.now(),
      };
    },
    staleTime: STALENESS_MS,
    enabled: !!userId,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  };
}

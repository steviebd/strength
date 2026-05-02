import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getTodayLocalDate } from '@/lib/timezone';
import { getCachedWhoopData, cacheWhoopData } from '@/db/whoop';
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

function isStale(timestamp: number): boolean {
  return Date.now() - timestamp > STALENESS_MS;
}

export function useWhoopData(
  date: string = getTodayLocalDate(),
  timezone: string = 'UTC',
): UseWhoopDataResult {
  const [data, setData] = useState<WhoopCache | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const loadData = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cached = await getCachedWhoopData(userId, date, timezone);
      if (cached && !isStale(cached.hydratedAt.getTime())) {
        setData({
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
        });
        setIsLoading(false);
        return;
      }

      const response = await apiFetch<{
        whoopRecovery: WhoopRecovery;
        whoopCycle: WhoopCycle;
        whoopUpdatedAt: number | null;
      }>(`/api/nutrition/daily-summary?date=${date}`);

      const fresh: WhoopCache = {
        recovery: response.whoopRecovery,
        cycle: response.whoopCycle,
        timestamp: Date.now(),
      };

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

      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load WHOOP data'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, date, timezone]);

  const refetch = useCallback(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, isLoading, error, refetch };
}

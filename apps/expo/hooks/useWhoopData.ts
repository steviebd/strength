import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/lib/api';
import { getTodayLocalDate } from '@/lib/timezone';

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

function getCacheKey(date: string, timezone: string): string {
  return `whoop_cache_${timezone}_${date}`;
}

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

  const saveToCache = useCallback(
    async (cacheData: WhoopCache) => {
      try {
        const key = getCacheKey(date, timezone);
        await AsyncStorage.setItem(key, JSON.stringify(cacheData));
      } catch {}
    },
    [date, timezone],
  );

  const loadFromCache = useCallback(async (): Promise<WhoopCache | null> => {
    try {
      const key = getCacheKey(date, timezone);
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        return JSON.parse(cached) as WhoopCache;
      }
      return null;
    } catch {
      return null;
    }
  }, [date, timezone]);

  const fetchFreshData = useCallback(async (): Promise<WhoopCache> => {
    const response = await apiFetch<{ whoopRecovery: WhoopRecovery; whoopCycle: WhoopCycle }>(
      `/api/nutrition/daily-summary?date=${date}`,
    );
    return {
      recovery: response.whoopRecovery,
      cycle: response.whoopCycle,
      timestamp: Date.now(),
    };
  }, [date]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cached = await loadFromCache();
      if (cached && !isStale(cached.timestamp)) {
        setData(cached);
        setIsLoading(false);
        return;
      }

      const fresh = await fetchFreshData();
      await saveToCache(fresh);
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load WHOOP data'));
    } finally {
      setIsLoading(false);
    }
  }, [loadFromCache, fetchFreshData, saveToCache]);

  const refetch = useCallback(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, isLoading, error, refetch };
}

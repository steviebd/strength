import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '@/lib/api';

interface WhoopRecovery {
  score: number | null;
  status: 'green' | 'yellow' | 'red' | null;
  hrv: number | null;
}

interface WhoopCycle {
  caloriesBurned: number | null;
  totalStrain: number | null;
}

export interface WhoopCache {
  recovery: WhoopRecovery | null;
  cycle: WhoopCycle | null;
  timestamp: number;
}

export interface UseWhoopDataResult {
  data: WhoopCache | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const STALENESS_MS = 15 * 60 * 1000;

function getCacheKey(date: string): string {
  return `whoop_cache_${date}`;
}

function isStale(timestamp: number): boolean {
  return Date.now() - timestamp > STALENESS_MS;
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function useWhoopData(date: string = getTodayDate()): UseWhoopDataResult {
  const [data, setData] = useState<WhoopCache | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const saveToCache = useCallback(
    async (cacheData: WhoopCache) => {
      try {
        const key = getCacheKey(date);
        await AsyncStorage.setItem(key, JSON.stringify(cacheData));
      } catch {}
    },
    [date],
  );

  const loadFromCache = useCallback(async (): Promise<WhoopCache | null> => {
    try {
      const key = getCacheKey(date);
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        return JSON.parse(cached) as WhoopCache;
      }
      return null;
    } catch {
      return null;
    }
  }, [date]);

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

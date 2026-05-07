import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { runTrainingSync } from '@/lib/workout-sync';
import { isNetworkError } from '@/lib/offline-mutation';

const MIN_REFRESH_DURATION_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getPullToRefreshErrorMessage(err: unknown): string {
  if (isNetworkError(err)) {
    return "Offline — data will sync when you're back online";
  }
  return err instanceof Error ? err.message : 'Sync failed';
}

export function usePullToRefresh(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isRunningRef = useRef(false);

  const handleRefresh = useCallback(async () => {
    if (!userId || isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRefreshing(true);

    const startTime = Date.now();

    try {
      await runTrainingSync(userId, { forceHydrate: true });
    } finally {
      // Always invalidate all queries so any fresh local data is picked up,
      // even if the sync partially failed (e.g. offline).
      await queryClient.invalidateQueries();

      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_REFRESH_DURATION_MS) {
        await delay(MIN_REFRESH_DURATION_MS - elapsed);
      }

      setIsRefreshing(false);
      isRunningRef.current = false;
    }
  }, [userId, queryClient]);

  return { isRefreshing, handleRefresh };
}

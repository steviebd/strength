import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { syncOfflineQueueAndCache } from '@/lib/workout-sync';
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
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRefreshing(true);

    try {
      if (!userId) {
        throw new Error('Not signed in');
      }

      const startTime = Date.now();
      await syncOfflineQueueAndCache(userId, { forceHydrate: true });

      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_REFRESH_DURATION_MS) {
        await delay(MIN_REFRESH_DURATION_MS - elapsed);
      }
    } finally {
      await queryClient.invalidateQueries();
      setIsRefreshing(false);
      isRunningRef.current = false;
    }
  }, [userId, queryClient]);

  return { isRefreshing, handleRefresh };
}

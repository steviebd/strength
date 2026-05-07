import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { syncOfflineQueueAndCache } from '@/lib/workout-sync';

export function useDataSync() {
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const sync = useCallback(
    async (forceHydrate = false) => {
      if (userId) {
        try {
          await syncOfflineQueueAndCache(userId, { forceHydrate });
        } catch {
          // Errors handled internally by syncOfflineQueueAndCache
        }
      }
      queryClient.invalidateQueries();
    },
    [userId, queryClient],
  );

  useEffect(() => {
    sync();
  }, [sync]);

  useFocusEffect(
    useCallback(() => {
      void sync();
    }, [sync]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
      }
    });
    return () => subscription.remove();
  }, [sync]);

  return { sync };
}

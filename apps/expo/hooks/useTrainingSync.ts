import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { authClient } from '@/lib/auth-client';
import { runTrainingSync } from '@/lib/workout-sync';

export function useTrainingSync() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const sync = useCallback(
    (forceHydrate = false) => {
      if (userId) {
        void runTrainingSync(userId, { forceHydrate });
      }
    },
    [userId],
  );

  useEffect(() => {
    sync();
  }, [sync]);

  useFocusEffect(sync);

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

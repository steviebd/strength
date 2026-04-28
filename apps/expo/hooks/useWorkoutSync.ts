import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { authClient } from '@/lib/auth-client';
import { runWorkoutSync } from '@/lib/workout-sync';

export function useWorkoutSync() {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const sync = useCallback(() => {
    if (userId) {
      void runWorkoutSync(userId);
    }
  }, [userId]);

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

import { useEffect, useRef, useState } from 'react';
import { getNetworkStateAsync, addNetworkStateListener } from 'expo-network';
import { onlineManager } from '@tanstack/react-query';
import { platformStorage } from '@/lib/platform-storage';
import { authClient } from '@/lib/auth-client';
import { waitForSessionReady } from '@/lib/auth-session';
import { router } from 'expo-router';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [networkType, setNetworkType] = useState<string | null>(null);
  const prevIsOnlineRef = useRef(true);
  const isRetryingRef = useRef(false);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    let isMounted = true;

    getNetworkStateAsync().then((state) => {
      if (!isMounted) return;
      const online = state.isConnected ?? true;
      setIsOnline(online);
      setNetworkType(state.type ?? null);
      onlineManager.setOnline(online);
    });

    const subscription = addNetworkStateListener((state) => {
      const online = state.isConnected ?? true;
      setIsOnline(online);
      setNetworkType(state.type ?? null);
      onlineManager.setOnline(online);
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  // Auto-retry queued auth actions when coming back online.
  // Credentials are stored in platformStorage (SecureStore on native, localStorage on web).
  useEffect(() => {
    if (!isOnline) {
      prevIsOnlineRef.current = false;
      isRetryingRef.current = false;
      return;
    }

    if (prevIsOnlineRef.current || isRetryingRef.current) return;
    if (session?.user) {
      prevIsOnlineRef.current = true;
      return;
    }

    prevIsOnlineRef.current = true;
    isRetryingRef.current = true;

    (async () => {
      try {
        const pendingSignIn = platformStorage.getItem('auth_pending_signin');
        if (pendingSignIn) {
          const { email, password } = JSON.parse(pendingSignIn);
          const result = await authClient.signIn.email({ email, password });
          if (result.error) return;

          const ready = await waitForSessionReady();
          if (!ready) return;

          platformStorage.removeItem('auth_pending_signin');
          router.replace('/(app)/home' as any);
          return;
        }

        const pendingSignUp = platformStorage.getItem('auth_pending_signup');
        if (pendingSignUp) {
          const { name, email, password } = JSON.parse(pendingSignUp);
          const result = await authClient.signUp.email({ name, email, password });
          if (result.error) return;

          const ready = await waitForSessionReady();
          if (!ready) return;

          platformStorage.removeItem('auth_pending_signup');
          router.replace('/(app)/home' as any);
        }
      } catch {
        // leave keys in storage on failure; the auth screen will show the error next time it's visited
      } finally {
        isRetryingRef.current = false;
      }
    })();
  }, [isOnline, session]);

  return {
    isOnline,
    isOffline: !isOnline,
    networkType,
  };
}

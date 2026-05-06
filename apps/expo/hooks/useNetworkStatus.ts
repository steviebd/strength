import { useEffect, useState } from 'react';
import { getNetworkStateAsync, addNetworkStateListener } from 'expo-network';
import { onlineManager } from '@tanstack/react-query';

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [networkType, setNetworkType] = useState<string | null>(null);

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

  return {
    isOnline,
    isOffline: !isOnline,
    networkType,
  };
}

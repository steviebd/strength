import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { authClient } from '@/lib/auth-client';
import { getPendingSyncItemCount } from '@/db/sync-queue';
import { colors } from '@/theme';

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? null;
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;

    const fetchCount = async () => {
      try {
        const count = await getPendingSyncItemCount(userId);
        if (mounted) {
          setPendingCount(count);
        }
      } catch {
        // ignore
      }
    };

    void fetchCount();
    const interval = setInterval(fetchCount, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userId]);

  if (isOffline) {
    return (
      <View
        style={{
          height: 38,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          style={{
            color: colors.error,
            fontSize: 13,
            fontWeight: '500',
          }}
        >
          Offline — data will sync when you're back online
        </Text>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View
        style={{
          height: 38,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text
          style={{
            color: colors.warning,
            fontSize: 13,
            fontWeight: '500',
          }}
        >
          {pendingCount} change(s) pending sync
        </Text>
      </View>
    );
  }

  return null;
}

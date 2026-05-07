import { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { authClient } from '@/lib/auth-client';
import { getPendingSyncItemCount } from '@/db/sync-queue';
import { colors, radius, spacing, typography } from '@/theme';

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
      <View style={styles.banner}>
        <Text style={[styles.text, styles.textError]}>
          Offline — data will sync when you're back online
        </Text>
      </View>
    );
  }

  if (pendingCount > 0) {
    return (
      <View style={styles.banner}>
        <Text style={[styles.text, styles.textWarning]}>{pendingCount} change(s) pending sync</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 38,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    paddingVertical: 10,
  },
  text: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  textError: {
    color: colors.error,
  },
  textWarning: {
    color: colors.warning,
  },
});

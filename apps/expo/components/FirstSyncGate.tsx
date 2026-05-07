import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { syncOfflineQueueAndCache } from '@/lib/workout-sync';
import { hasCompletedFirstSync, markFirstSyncComplete } from '@/lib/first-sync';
import { colors, spacing, typography } from '@/theme';

export function FirstSyncGate({ children }: { children: React.ReactNode }) {
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  useEffect(() => {
    if (!userId) {
      setSyncDone(false);
      return;
    }

    let cancelled = false;

    async function run(uid: string) {
      const alreadyDone = await hasCompletedFirstSync(uid);
      if (alreadyDone) {
        if (!cancelled) setSyncDone(true);
        return;
      }

      if (!cancelled) setIsSyncing(true);

      const timeout = setTimeout(() => {
        if (!cancelled) {
          setIsSyncing(false);
          setSyncDone(true);
          void markFirstSyncComplete(uid);
        }
      }, 10_000);

      try {
        await syncOfflineQueueAndCache(uid, { forceHydrate: true });
      } catch {
        // Allow timeout to handle UI unblock
      } finally {
        clearTimeout(timeout);
        if (!cancelled) {
          setIsSyncing(false);
          setSyncDone(true);
          await markFirstSyncComplete(uid);
        }
      }
    }

    run(userId);

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (isSyncing) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accentSecondary} />
        <Text style={styles.text}>Syncing your data...</Text>
      </View>
    );
  }

  if (!userId || syncDone) {
    return children;
  }

  // Waiting for sync check to complete; show spinner briefly
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accentSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  text: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    fontWeight: typography.fontWeights.medium,
  },
});

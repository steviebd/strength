import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState, useEffect } from 'react';
import { useRouter } from 'expo-router';
import { PageLayout } from '@/components/ui/PageLayout';
import { PageHeader } from '@/components/ui/app-primitives';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { apiFetch } from '@/lib/api';
import * as WebBrowser from 'expo-web-browser';
import { colors, radius, spacing, typography } from '@/theme';

interface WhoopStatus {
  connected: boolean;
  whoopUserId?: string;
  profile?: {
    email?: string;
    firstName?: string;
    lastName?: string;
  };
}

async function fetchWhoopStatus(): Promise<WhoopStatus> {
  return apiFetch<WhoopStatus>('/api/whoop/status');
}

async function connectWhoop(): Promise<{ authUrl?: string; error?: string }> {
  return apiFetch<{ authUrl?: string; error?: string; message?: string }>('/api/whoop/auth', {
    method: 'POST',
  }).catch(() => ({ error: 'Failed to connect' }));
}

async function disconnectWhoop(): Promise<void> {
  await apiFetch('/api/whoop/disconnect', { method: 'POST' });
}

async function syncWhoop(): Promise<{ success: boolean; errors?: string[] }> {
  return apiFetch<{ success: boolean; errors?: string[] }>('/api/whoop/sync-all', {
    method: 'POST',
  });
}

export default function Profile() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { weightUnit, setWeightUnit, isLoading } = useUserPreferences();

  const [whoopStatus, setWhoopStatus] = useState<WhoopStatus | null>(null);
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = () => {
    authClient.signOut();
  };

  const handleConnectWhoop = async () => {
    setError(null);
    setWhoopLoading(true);
    try {
      const result = await connectWhoop();
      if (result.authUrl) {
        await WebBrowser.openBrowserAsync(result.authUrl);
      } else if (result.error) {
        setError(result.error);
      }
    } catch {
      setError('Failed to connect to WHOOP');
    } finally {
      setWhoopLoading(false);
    }
  };

  const handleDisconnectWhoop = async () => {
    setError(null);
    setWhoopLoading(true);
    try {
      await disconnectWhoop();
      setWhoopStatus({ connected: false });
    } catch {
      setError('Failed to disconnect WHOOP');
    } finally {
      setWhoopLoading(false);
    }
  };

  const handleSyncWhoop = async () => {
    setError(null);
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncWhoop();
      if (result.success) {
        setSyncResult('Sync completed successfully!');
      } else {
        setSyncResult(`Sync completed with errors: ${result.errors?.join(', ')}`);
      }
    } catch {
      setSyncResult('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const loadWhoopStatus = async () => {
    setWhoopLoading(true);
    try {
      const status = await fetchWhoopStatus();
      setWhoopStatus(status);
    } catch (e) {
      console.error('Failed to load WHOOP status:', e);
    } finally {
      setWhoopLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    void loadWhoopStatus();
  }, [session?.user]);

  if (isPending) {
    return (
      <PageLayout header={<PageHeader title="Profile" />}>
        <View style={styles.loadingCentered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </PageLayout>
    );
  }

  if (!session?.user) {
    return (
      <PageLayout header={<PageHeader title="Profile" />}>
        <View style={styles.loadingCentered}>
          <Text style={styles.loadingText}>Not signed in</Text>
        </View>
      </PageLayout>
    );
  }

  const { user } = session;
  const initial = user.name?.[0]?.toUpperCase() ?? '?';

  return (
    <PageLayout
      screenScrollViewProps={{ bottomInset: 120 }}
      header={<PageHeader title="Profile" description={user.email} />}
    >
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
        <Text style={styles.userName}>{user.name}</Text>
        <Text style={styles.userEmail}>{user.email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Name</Text>
          <Text style={styles.rowValue}>{user.name}</Text>
        </View>

        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={[styles.rowValue, styles.rowValueFlex]} numberOfLines={1}>
            {user.email}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>WHOOP Integration</Text>

        {whoopLoading && !whoopStatus ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : whoopStatus?.connected ? (
          <View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status</Text>
              <View style={styles.rowValueRight}>
                <View style={styles.statusDot} />
                <Text style={styles.statusConnectedText}>Connected</Text>
              </View>
            </View>

            {whoopStatus.profile && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>WHOOP User</Text>
                <Text style={[styles.rowValue, styles.rowValueFlex]} numberOfLines={1}>
                  {whoopStatus.profile.firstName} {whoopStatus.profile.lastName}
                </Text>
              </View>
            )}

            {whoopStatus.profile?.email && (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>WHOOP Email</Text>
                <Text style={[styles.rowValue, styles.rowValueFlex]} numberOfLines={1}>
                  {whoopStatus.profile.email}
                </Text>
              </View>
            )}

            <View style={styles.buttonGroup}>
              <Pressable
                onPress={handleSyncWhoop}
                disabled={syncing}
                style={[styles.button, styles.buttonPrimary, syncing && styles.buttonDisabled]}
              >
                {syncing ? (
                  <View style={styles.buttonSpinner}>
                    <ActivityIndicator color="#ffffff" size="small" />
                  </View>
                ) : (
                  <Text style={styles.buttonPrimaryText}>Sync Data</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => router.push('/(app)/whoop')}
                style={[styles.button, styles.buttonSecondary]}
              >
                <Text style={styles.buttonSecondaryText}>View Data</Text>
              </Pressable>

              <Pressable
                onPress={handleDisconnectWhoop}
                disabled={whoopLoading}
                style={[styles.button, styles.buttonDanger, whoopLoading && styles.buttonDisabled]}
              >
                <Text style={styles.buttonDangerText}>Disconnect</Text>
              </Pressable>
            </View>

            {syncResult && (
              <View style={styles.syncResultBox}>
                <Text style={styles.syncResultText}>{syncResult}</Text>
              </View>
            )}
          </View>
        ) : (
          <View>
            <Text style={styles.connectDescription}>
              Connect your WHOOP account to automatically sync workouts, recovery data, sleep, and
              more.
            </Text>

            <Pressable
              onPress={handleConnectWhoop}
              disabled={whoopLoading}
              style={[styles.button, styles.buttonWhoop, whoopLoading && styles.buttonDisabled]}
            >
              {whoopLoading ? (
                <View style={styles.buttonSpinner}>
                  <ActivityIndicator color="#ffffff" size="small" />
                </View>
              ) : (
                <Text style={styles.buttonPrimaryText}>Connect WHOOP</Text>
              )}
            </Pressable>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Settings</Text>

        <View style={styles.row}>
          <Text style={styles.rowLabel}>Weight Unit</Text>
          <View style={styles.unitToggle}>
            <Pressable
              onPress={() => setWeightUnit('kg')}
              disabled={isLoading}
              style={[
                styles.unitButton,
                weightUnit === 'kg' ? styles.unitButtonActive : styles.unitButtonInactive,
              ]}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  weightUnit === 'kg' ? styles.unitButtonTextActive : styles.unitButtonTextInactive,
                ]}
              >
                kg
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setWeightUnit('lbs')}
              disabled={isLoading}
              style={[
                styles.unitButton,
                weightUnit === 'lbs' ? styles.unitButtonActive : styles.unitButtonInactive,
              ]}
            >
              <Text
                style={[
                  styles.unitButtonText,
                  weightUnit === 'lbs'
                    ? styles.unitButtonTextActive
                    : styles.unitButtonTextInactive,
                ]}
              >
                lbs
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Notifications</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Privacy</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Help & Support</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      </View>

      <Pressable onPress={handleSignOut} style={[styles.button, styles.buttonSignOut]}>
        <Text style={styles.buttonSignOutText}>Sign Out</Text>
      </Pressable>

      <View style={styles.versionRow}>
        <Text style={styles.versionText}>Strength v1.0.0</Text>
      </View>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  loadingCentered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
  },
  userName: {
    fontSize: 24,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  userEmail: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  rowValue: {
    fontSize: typography.fontSizes.base,
    color: colors.text,
  },
  rowValueFlex: {
    flex: 1,
    textAlign: 'right',
  },
  rowValueRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowChevron: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusConnectedText: {
    fontSize: typography.fontSizes.sm,
    color: colors.success,
  },
  loadingRow: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  buttonGroup: {
    marginTop: 16,
    gap: 12,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
  },
  buttonPrimaryText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
  },
  buttonSecondary: {
    backgroundColor: colors.border,
  },
  buttonSecondaryText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  buttonDanger: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
  },
  buttonDangerText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.accent,
  },
  buttonWhoop: {
    backgroundColor: '#E41E3F',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonSpinner: {
    alignItems: 'center',
  },
  syncResultBox: {
    marginTop: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    padding: 12,
  },
  syncResultText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  connectDescription: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    marginBottom: 16,
    lineHeight: 22,
  },
  errorBox: {
    marginTop: 12,
    borderRadius: radius.sm,
    backgroundColor: `${colors.error}20`,
    padding: 12,
  },
  errorText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
  },
  unitToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  unitButton: {
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  unitButtonActive: {
    backgroundColor: colors.accent,
  },
  unitButtonInactive: {
    backgroundColor: colors.border,
  },
  unitButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  unitButtonTextActive: {
    color: '#ffffff',
  },
  unitButtonTextInactive: {
    color: colors.textMuted,
  },
  buttonSignOut: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    paddingVertical: 16,
  },
  buttonSignOutText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
    textAlign: 'center',
  },
  versionRow: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  versionText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
});

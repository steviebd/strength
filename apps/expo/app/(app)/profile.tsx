import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PageLayout } from '@/components/ui/PageLayout';
import { PageHeader } from '@/components/ui/app-primitives';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { colors, radius, spacing, typography } from '@/theme';
import { Input } from '@/components/ui/Input';
import { convertToDisplayWeight, convertToStorageWeight } from '@strength/db';
import { TimezonePickerModal } from '@/components/profile/TimezonePickerModal';

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

async function connectWhoop(returnTo: string): Promise<{ authUrl?: string; error?: string }> {
  return apiFetch<{ authUrl?: string; error?: string; message?: string }>('/api/whoop/auth', {
    method: 'POST',
    body: JSON.stringify({ returnTo }),
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

function parseWhoopCallbackResult(url: string) {
  try {
    const parsed = new URL(url);
    return {
      error: parsed.searchParams.get('error'),
      success: parsed.searchParams.get('success'),
    };
  } catch {
    return { error: null, success: null };
  }
}

export default function Profile() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ whoop?: string; error?: string; focus?: string }>();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const { weightUnit, timezone, deviceTimezone, setWeightUnit, setTimezone, isLoading } =
    useUserPreferences();
  const scrollViewRef = useRef<ScrollView>(null);
  const whoopSectionY = useRef(0);

  const [displayBodyweight, setDisplayBodyweight] = useState('');
  const [whoopStatus, setWhoopStatus] = useState<WhoopStatus | null>(null);
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [timezoneModalVisible, setTimezoneModalVisible] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightWhoopCard, setHighlightWhoopCard] = useState(false);
  const [shouldFocusWhoopCard, setShouldFocusWhoopCard] = useState(false);

  const { data: bodyStats } = useQuery({
    queryKey: ['body-stats'],
    queryFn: () => apiFetch<{ bodyweightKg: number | null }>('/api/nutrition/body-stats'),
  });

  const saveBodyweightMutation = useMutation({
    mutationFn: (bodyweightKg: number) =>
      apiFetch('/api/nutrition/body-stats', {
        method: 'POST',
        body: JSON.stringify({ bodyweightKg }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['body-stats'] });
      queryClient.invalidateQueries({ queryKey: ['nutrition-daily-summary'] });
    },
  });

  useEffect(() => {
    if (bodyStats?.bodyweightKg !== undefined && bodyStats?.bodyweightKg !== null) {
      const display = convertToDisplayWeight(bodyStats.bodyweightKg, weightUnit);
      setDisplayBodyweight(display.toFixed(1));
    }
  }, [bodyStats, weightUnit]);

  const handleBodyweightChange = useCallback((text: string) => {
    setDisplayBodyweight(text);
  }, []);

  const handleSaveBodyweight = () => {
    const value = parseFloat(displayBodyweight);
    if (!isNaN(value) && value > 0) {
      const kg = convertToStorageWeight(value, weightUnit);
      saveBodyweightMutation.mutate(kg);
    }
  };

  const handleSignOut = () => {
    authClient.signOut();
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

  const handleConnectWhoop = async () => {
    setError(null);
    setWhoopLoading(true);
    try {
      const returnTo = Linking.createURL('/whoop-callback');
      const result = await connectWhoop(returnTo);
      if (result.authUrl) {
        const authResult = await WebBrowser.openAuthSessionAsync(result.authUrl, returnTo);
        if (authResult.type === 'success') {
          const callback = parseWhoopCallbackResult(authResult.url);
          if (callback.success === 'true') {
            setSyncResult('WHOOP connected successfully!');
            setHighlightWhoopCard(true);
            setShouldFocusWhoopCard(true);
            await loadWhoopStatus();
            return;
          }

          if (callback.error) {
            setError(decodeURIComponent(callback.error).replace(/_/g, ' '));
            await loadWhoopStatus();
            return;
          }
        }

        if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
          setError('WHOOP authorization was not completed');
        }
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
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    void loadWhoopStatus();
  }, [session?.user]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }

    if (searchParams.whoop === 'connected') {
      setError(null);
      setSyncResult('WHOOP connected successfully!');
      if (searchParams.focus === 'whoop') {
        setHighlightWhoopCard(true);
        setShouldFocusWhoopCard(true);
      }
      void loadWhoopStatus();
      router.replace('/(app)/profile');
      return;
    }

    if (typeof searchParams.error === 'string' && searchParams.error.length > 0) {
      setError(decodeURIComponent(searchParams.error).replace(/_/g, ' '));
      void loadWhoopStatus();
      router.replace('/(app)/profile');
    }
  }, [router, searchParams.error, searchParams.focus, searchParams.whoop, session?.user]);

  useEffect(() => {
    if (!shouldFocusWhoopCard) {
      return;
    }

    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(whoopSectionY.current - spacing.lg, 0),
        animated: true,
      });
      setShouldFocusWhoopCard(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [shouldFocusWhoopCard, whoopStatus?.connected]);

  useEffect(() => {
    if (!highlightWhoopCard) {
      return;
    }

    const timer = setTimeout(() => setHighlightWhoopCard(false), 2200);
    return () => clearTimeout(timer);
  }, [highlightWhoopCard]);

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
      scrollViewRef={scrollViewRef}
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
        <Text style={styles.cardTitle}>Body Stats</Text>

        <View style={styles.bodyweightRow}>
          <Text style={styles.rowLabel}>Weight ({weightUnit})</Text>
          <View style={styles.bodyweightInputRow}>
            <Input
              style={styles.bodyweightInput}
              value={displayBodyweight}
              onChangeText={handleBodyweightChange}
              placeholder="0.0"
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            <Pressable
              onPress={handleSaveBodyweight}
              disabled={saveBodyweightMutation.isPending}
              style={[
                styles.saveButton,
                saveBodyweightMutation.isPending && styles.saveButtonDisabled,
              ]}
            >
              {saveBodyweightMutation.isPending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <View
        style={[styles.card, highlightWhoopCard ? styles.cardHighlighted : null]}
        onLayout={(event) => {
          whoopSectionY.current = event.nativeEvent.layout.y;
        }}
      >
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

        <Pressable style={styles.row} onPress={() => setTimezoneModalVisible(true)}>
          <Text style={styles.rowLabel}>Timezone</Text>
          <View style={styles.rowValueRight}>
            <Text style={[styles.rowValue, styles.timezoneValue]} numberOfLines={1}>
              {timezone ?? deviceTimezone ?? 'Select timezone'}
            </Text>
            <Text style={styles.rowChevron}>›</Text>
          </View>
        </Pressable>

        <Pressable style={styles.row}>
          <Text style={styles.rowLabel}>Notifications</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable style={styles.row}>
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

      <TimezonePickerModal
        visible={timezoneModalVisible}
        selectedTimezone={timezone ?? deviceTimezone}
        onClose={() => setTimezoneModalVisible(false)}
        onConfirm={async (nextTimezone) => {
          await setTimezone(nextTimezone);
          setTimezoneModalVisible(false);
        }}
      />
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
    color: colors.text,
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
  cardHighlighted: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
    flexShrink: 1,
    marginLeft: spacing.md,
  },
  timezoneValue: {
    maxWidth: 180,
    textAlign: 'right',
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
    color: colors.text,
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
    color: colors.text,
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
    color: colors.text,
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
  bodyweightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bodyweightInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bodyweightInput: {
    width: 100,
    height: 40,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
});

import { Pressable, Text, View, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { apiFetch } from '@/lib/api';
import * as WebBrowser from 'expo-web-browser';

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

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <Text className="text-darkMuted">Loading...</Text>
      </View>
    );
  }

  if (!session?.user) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <Text className="text-darkMuted">Not signed in</Text>
      </View>
    );
  }

  const { user } = session;
  const initial = user.name?.[0]?.toUpperCase() ?? '?';

  useEffect(() => {
    loadWhoopStatus();
  }, []);

  return (
    <View className="flex-1 bg-darkBg">
      <View className="px-6 pt-16">
        <Text className="text-darkMuted text-sm font-medium uppercase tracking-wider">Profile</Text>

        <View className="mt-6 items-center">
          <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-pine">
            <Text className="text-3xl font-semibold text-white">{initial}</Text>
          </View>
          <Text className="text-darkText text-2xl font-semibold">{user.name}</Text>
          <Text className="text-darkMuted mt-1 text-sm">{user.email}</Text>
        </View>

        <View className="mt-8 rounded-3xl border border-darkBorder bg-darkCard p-6">
          <Text className="text-darkText mb-4 text-sm font-semibold">Account</Text>

          <View className="mb-4 flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Name</Text>
            <Text className="text-darkText text-sm">{user.name}</Text>
          </View>

          <View className="flex-row items-center justify-between py-3">
            <Text className="text-darkMuted text-sm">Email</Text>
            <Text className="text-darkText text-sm">{user.email}</Text>
          </View>
        </View>

        <View className="mt-6 rounded-3xl border border-darkBorder bg-darkCard p-6">
          <Text className="text-darkText mb-4 text-sm font-semibold">WHOOP Integration</Text>

          {whoopLoading && !whoopStatus ? (
            <View className="items-center py-4">
              <ActivityIndicator color="#F97066" />
            </View>
          ) : whoopStatus?.connected ? (
            <View>
              <View className="mb-4 flex-row items-center justify-between py-3 border-b border-darkBorder">
                <Text className="text-darkMuted text-sm">Status</Text>
                <View className="flex-row items-center gap-2">
                  <View className="h-2 w-2 rounded-full bg-green-500" />
                  <Text className="text-green text-sm">Connected</Text>
                </View>
              </View>

              {whoopStatus.profile && (
                <View className="mb-4 flex-row items-center justify-between py-3 border-b border-darkBorder">
                  <Text className="text-darkMuted text-sm">WHOOP User</Text>
                  <Text className="text-darkText text-sm">
                    {whoopStatus.profile.firstName} {whoopStatus.profile.lastName}
                  </Text>
                </View>
              )}

              {whoopStatus.profile?.email && (
                <View className="mb-4 flex-row items-center justify-between py-3 border-b border-darkBorder">
                  <Text className="text-darkMuted text-sm">WHOOP Email</Text>
                  <Text className="text-darkText text-sm">{whoopStatus.profile.email}</Text>
                </View>
              )}

              <View className="flex-row gap-3 mt-4">
                <Pressable
                  onPress={handleSyncWhoop}
                  disabled={syncing}
                  className="flex-1 rounded-xl bg-pine py-3"
                >
                  {syncing ? (
                    <View className="items-center">
                      <ActivityIndicator color="white" size="small" />
                    </View>
                  ) : (
                    <Text className="text-center text-sm font-semibold text-white">Sync Data</Text>
                  )}
                </Pressable>

                <Pressable
                  onPress={handleDisconnectWhoop}
                  disabled={whoopLoading}
                  className="flex-1 rounded-xl border border-coral py-3"
                >
                  <Text className="text-center text-sm font-semibold text-coral">Disconnect</Text>
                </Pressable>
              </View>

              {syncResult && (
                <View className="mt-3 rounded-lg bg-darkBorder p-3">
                  <Text className="text-darkMuted text-xs">{syncResult}</Text>
                </View>
              )}
            </View>
          ) : (
            <View>
              <Text className="text-darkMuted text-sm mb-4">
                Connect your WHOOP account to automatically sync workouts, recovery data, sleep, and
                more.
              </Text>

              <Pressable
                onPress={handleConnectWhoop}
                disabled={whoopLoading}
                className="rounded-xl bg-[#E41E3F] py-3"
              >
                {whoopLoading ? (
                  <View className="items-center">
                    <ActivityIndicator color="white" size="small" />
                  </View>
                ) : (
                  <Text className="text-center text-sm font-semibold text-white">
                    Connect WHOOP
                  </Text>
                )}
              </Pressable>
            </View>
          )}

          {error && (
            <View className="mt-3 rounded-lg bg-red-500/20 p-3">
              <Text className="text-red-400 text-xs">{error}</Text>
            </View>
          )}
        </View>

        <View className="mt-6 rounded-3xl border border-darkBorder bg-darkCard p-6">
          <Text className="text-darkText mb-4 text-sm font-semibold">Settings</Text>

          <View className="flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Weight Unit</Text>
            <View className="flex-row gap-2">
              <Pressable
                onPress={() => setWeightUnit('kg')}
                disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 ${
                  weightUnit === 'kg' ? 'bg-coral text-white' : 'bg-darkBorder text-darkMuted'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${weightUnit === 'kg' ? 'text-white' : 'text-darkMuted'}`}
                >
                  kg
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWeightUnit('lbs')}
                disabled={isLoading}
                className={`rounded-lg px-3 py-1.5 ${
                  weightUnit === 'lbs' ? 'bg-coral text-white' : 'bg-darkBorder text-darkMuted'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${weightUnit === 'lbs' ? 'text-white' : 'text-darkMuted'}`}
                >
                  lbs
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable className="flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Notifications</Text>
            <Text className="text-darkMuted text-sm">›</Text>
          </Pressable>

          <Pressable className="flex-row items-center justify-between py-3 border-b border-darkBorder">
            <Text className="text-darkMuted text-sm">Privacy</Text>
            <Text className="text-darkMuted text-sm">›</Text>
          </Pressable>

          <Pressable className="flex-row items-center justify-between py-3">
            <Text className="text-darkMuted text-sm">Help & Support</Text>
            <Text className="text-darkMuted text-sm">›</Text>
          </Pressable>
        </View>

        <Pressable onPress={handleSignOut} className="mt-8 rounded-2xl bg-coral py-4">
          <Text className="text-center text-base font-semibold text-white">Sign Out</Text>
        </Pressable>

        <View className="mt-8 items-center">
          <Text className="text-darkMuted text-xs">Strength v1.0.0</Text>
        </View>
      </View>
    </View>
  );
}
